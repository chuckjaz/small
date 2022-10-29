import { searchNum } from './array-search';
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
    readonly location: number
    stackDepth(): number
    requestFrame(frame?: number): DebugFrame
    validBreakLocations(start?: number, end?: number): number[]
    breakpointList(start?: number, end?: number): number[]
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
    private validBreakPoints = new Set<number>()
    private breakPoints: boolean[] = []
    private minBreak = Number.MAX_SAFE_INTEGER
    private maxBreak = 0
    private state: Iterator<Instruction, any, number>
    private controller: DebugController
    private validBreakPointsCache: number[] | undefined = undefined

    private context = function (d): DebugContext {
        return {
            get location() { return d.stack.location },
            stackDepth(): number { return d.stack.depth },
            requestFrame(frame?: number): DebugFrame {
                return d.stack.frame(frame ?? this.stackDepth() - 1)
            },
            validBreakLocations(start?: number, end?: number): number[] {
                return d.validBreakLocations(start, end)
            },
            breakpointList(start?: number, end?: number): number[] {
                return d.breakpointList(start, end)
            }
        }
    }(this)

    constructor(controller: DebugController) {
        this.state = this.debug()
        this.controller = controller
    }

    recordLocation(location: number): void {
        if (!(this.validBreakPoints.has(location))) {
            this.validBreakPoints.add(location)
            this.validBreakPointsCache = undefined
        }
    }

    startFunction(location: number, callContext: CallContext): void {
        this.stack.push(location, callContext)
    }

    endFunction(location: number): void {
        this.stack.pop()
    }

    statement(location: number, callContext: CallContext): boolean {
        this.stack.update(location, callContext)
        const result = this.state.next(location)
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
                        console.log("Stopping for breakpoint")
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
                            if (loc < this.minBreak) this.minBreak = loc
                            if (loc > this.maxBreak) this.maxBreak = loc
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
                            this.minBreak = Number.MAX_SAFE_INTEGER
                            this.maxBreak = 0
                        }
                        break
                    }
                }
            } else state = State.Stopped
        }
    }

    private updateBreakpointCache() {
        if (this.validBreakPointsCache) return
        const cache: number[] = []
        for (const point of this.validBreakPoints.keys()) {
            cache.push(point)
        }
        cache.sort()
        this.validBreakPointsCache = cache
    }

    validBreakLocations(start: number = this.minBreak, end: number = this.maxBreak): number[] {
        this.updateBreakpointCache()
        const breakpoints = this.validBreakPointsCache ?? []
        const startIndex = search(breakpoints, start)
        const endIndex = search(breakpoints, end)
        return breakpoints.slice(startIndex, endIndex)
    }

    breakpointList(start: number = this.minBreak, end: number = this.maxBreak): number[] {
        const result: number[] = []
        this.breakPoints.forEach((value, index) => {
            if (value && (index >= start && index <= end)) {
                result.push(index)
            }
        })
        return result
    }
}

function search(arr: number[], value: number): number {
    const result = searchNum(arr, value)
    return result > 0 ? result : -result - 1
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