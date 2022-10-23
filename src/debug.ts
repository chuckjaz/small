import { Expression } from './ast';
import { Debugger, evaluate, Value } from './eval'

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
}

export interface DebugContext {
    location: number
    stackDepth(): number
    requestFrame(frame: number): DebugFrame
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
            requestFrame(frame: number): DebugFrame {
                return d.stack.frame(frame)
            }
        }
    }(this)

    constructor(controller: DebugController) {
        this.state = this.debug()
        this.controller = controller
    }

    startFunction(location: number): void {
        this.stack.push(location)
    }

    endFunction(location: number): void {
        this.stack.pop()
    }

    statement(location: number): boolean {
        this.stack.update(location)
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
    private locations: [number,number][] = [[0, 0]]

    update(location: number) {
        this.locations[this.depth -1][1] = location
    }

    push(location: number) {
        this.locations.push([location, 0])
    }

    pop() { this.locations.pop() }

    get depth() { return this.locations.length }
    get location() {
        return this.locations[this.depth - 1][1]
    }

    frame(depth: number): DebugFrame {
        const [func, location] = this.locations[depth]
        return { func, location }
    }
}