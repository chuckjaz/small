import { Expression, LiteralKind, Node, NodeKind } from './ast';
import { CallContext, Debugger, ErrorValue, evaluate, symbolOf, Value } from './eval'
import { Lexer } from './lexer';
import { parse } from './parser';

const enum Instruction {
    Continue
}

const enum State {
    StepInto,
    StepOver,
    StepOut,
    Running,
    Stopped,
}

export const enum RequestKind {
    StepInto,
    StepOver,
    StepOut,
    Run,
    SetBreakpoints,
    ClearBreakpoints,
    Terminate,
}

export type Request = StepInto | StepOver | StepOut | Run | SetBreakpoints | ClearBreakpoints |
    Terminate

export interface StepInto {
    kind: RequestKind.StepInto
}

export interface StepOver {
    kind: RequestKind.StepOver
}

export interface StepOut {
    kind: RequestKind.StepOut
}

export interface Run {
    kind: RequestKind.Run
}

export interface SetBreakpoints {
    kind: RequestKind.SetBreakpoints
    locations: Array<number>
}

export interface ClearBreakpoints {
    kind: RequestKind.ClearBreakpoints
    locations?: Array<number>
}

export interface Terminate {
    kind: RequestKind.Terminate
}

export interface DebugFrame {
    location: number
    func: number
    callContext: CallContext
}

export interface DebugContext {
    location: number
    stackDepth(): number
    requestFrame(frame?: number): DebugFrame
}

export interface DebugController {
    notification(context: DebugContext): Request
}

export function debug(
    expression: Expression,
    controller: DebugController,
    imports?: (name: string) => Value
): Value {
    const dbg = new Debug(controller)
    const result = evaluate(expression, imports, dbg)
    return result
}

export class Debug implements Debugger {
    private stack = new Stack()
    private breakPoints: boolean[] = []
    private state: Iterator<Instruction, any, number>
    private controller: DebugController

    private context = function (d): DebugContext {
        return {
            get location() { return d.stack.location },
            stackDepth(): number { return d.stack.depth },
            requestFrame(frame?: number): DebugFrame {
                return d.stack.frame(frame ?? this.stackDepth() - 1)
            }
        }
    }(this)

    constructor(controller: DebugController) {
        this.state = this.debug()
        this.controller = controller
    }

    startFunction(location: number, callContext: CallContext): void {
        this.stack.push(location, callContext)
    }

    endFunction(location: number): void {
        this.stack.pop()
    }

    statement(location: number, callContext: CallContext): boolean {
        this.stack.update(location, callContext)
        const result = this.state.next()
        return !result.done
    }

    *debug(): Iterator<Instruction, any, number> {
        let state: State = State.StepInto
        let stepOverDepth = 0
        let location = 0

        main: while (true) {
            location = state == State.Stopped ? location : yield Instruction.Continue
            switch (state) {
                case State.StepInto:
                    state = State.Stopped;
                    break
                case State.StepOver: {
                    if (this.stack.depth <= stepOverDepth) {
                        state = State.Stopped
                        break
                    }
                    continue main
                }
                case State.StepOut: {
                    if (this.stack.depth < stepOverDepth) {
                        state = State.Stopped
                        break
                    }
                    continue main
                }
                case State.Running:
                    if (this.breakPoints[location] === true) {
                        state = State.Stopped
                        break
                    }
                    continue main
                case State.Stopped: break
            }
            const request = this.controller.notification(this.context)
            if (request) {
                switch (request.kind) {
                    case RequestKind.Run: state = State.Running; break
                    case RequestKind.StepInto: state = State.StepInto; break
                    case RequestKind.StepOver:
                        stepOverDepth = this.stack.depth
                        state = State.StepOver
                        break
                    case RequestKind.StepOut:
                        stepOverDepth = this.stack.depth
                        state = State.StepOut
                        break
                    case RequestKind.Terminate: return
                    case RequestKind.SetBreakpoints: {
                        for (const loc of request.locations) {
                            this.breakPoints[loc] = true
                        }
                        state = State.Stopped
                        break
                    }
                    case RequestKind.ClearBreakpoints: {
                        const locations = request.locations
                        if (locations) {
                            for (const loc of locations) {
                                this.breakPoints[loc] = false
                            }
                        } else {
                            this.breakPoints = []
                        }
                        break
                    }
                }
            } else state = State.Stopped
        }

    }
}

class Stack {
    private frames: DebugFrame[] = [{ func: 0, location: 0, callContext: []}]

    update(location: number, callContext: CallContext) {
        const frame = this.frames[this.depth - 1]
        frame.location = location
        frame.callContext = callContext
    }

    push(location: number, callContext: CallContext) {
        this.frames.push({ func: location, location: 0, callContext })
    }

    pop() { this.frames.pop() }

    get depth() { return this.frames.length }
    get location() {
        return this.frames[this.depth - 1].location
    }

    frame(depth: number): DebugFrame {
        return this.frames[depth]
    }
}

export function debugEvaluator(text: string, callContext: CallContext): Value {
    const lexer = new Lexer(text)
    const node = parse(lexer, "<expression>")
    return e(node)

    function e(node: Expression): Value {
        switch (node.kind) {
            case NodeKind.Literal: return node
            case NodeKind.Reference: {
                const symbol = symbolOf(node.name)
                for (const file of callContext) {
                    const index = file.symbols?.indexOf(symbol) ?? -1
                    if (index >= 0) return file[index]
                }
                return err(node, `Symbol "${node.name}" not found`)
            }
            case NodeKind.Select: {
                const target = e(node.target)
                const symbol = symbolOf(node.name)
                switch (target.kind) {
                    case NodeKind.Record: {
                        const index = target.cls[symbol]
                        if (index !== undefined) return target.values[index]
                        return err(node, `Member ${node.name} not found`)
                    }
                    case NodeKind.Error: return target
                    default: return err(node, "Expected a record")
                }
            }
            case NodeKind.Index: {
                const target = e(node.target)
                if (target.kind == NodeKind.Error) return target
                if (target.kind != NodeKind.Array) 
                    return err(node.target, "Expected an array")
                const index = e(node.index)
                if (index.kind == NodeKind.Error) return index
                if (index.kind != NodeKind.Literal || index.literal != LiteralKind.Int)
                    return err(node.index, "Expected an integer")
                return target.values[index.value] ?? err(node.index, `Index out of bound, ${index.value}, 0..${target.values.length - 1}`)
            }
            default:
               return err(node, "Unsupported in the debugger")
        }
    }

    function err(node: Node, message: string): ErrorValue {
        return {
            kind: NodeKind.Error,
            message,
            start: node.start
        }
    }
}