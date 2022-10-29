import { DebugContext, DebugController, RequestKind, StepInto, StepOut, StepOver, Request, Terminate, Run, debugEvaluator, SetBreakpoints, ClearBreakpoints } from "./debug";
import { FileSet, Position } from "./files";
import * as fs from 'fs'
import { valueToString } from "./value-string";
import { NodeKind } from "./ast";
import { nameOfSymbol } from "./eval";

interface Command {
    name: string
    shortNames: string[]
    description: string
    execute: (context: DebugContext, ...args: string[]) => Request | undefined
}

const stepInto: StepInto = { kind: RequestKind.StepInto }
const stepOver: StepOver = { kind: RequestKind.StepOver }
const stepOut: StepOut = { kind: RequestKind.StepOut }
const terminate: Terminate = { kind: RequestKind.Terminate }
const run: Run = { kind: RequestKind.Run }
const stopped = undefined

export class TextDebugger implements DebugController {
    private fileSet: FileSet
    private fileText: Map<string, string>
    private commands = new Map<string, Command>()
    private definitions: Command[] = []

    constructor(fileSet: FileSet, fileText?: Map<string, string>) {
        this.fileSet = fileSet
        this.fileText = fileText ?? new Map()
        this.command("step", () => stepOver, "Step over the current call", "s")
        this.command("next", () => stepInto, "Step into the current call", "n")
        this.command("out", () => stepOut, "Step out of the current function", "o")
        this.command("quit", () => terminate, "Terminate the debugging session", "q")
        this.command("run", () => run, "Run the to the next break-point", "r")
        this.command("trace", this.trace.bind(this), "Print the stack", "bt")
        this.command("break", this.break.bind(this), "Set a break points", "bp")
        this.command("breaklist", this.breaklist.bind(this), "Get the list of set breakpoints", "bl")
        this.command("clear", this.clearBreakpoints.bind(this), "Clear all breakpoints")
        this.command("files", this.files.bind(this), "Print the current list of files active")
        this.command("evaluate", this.evaluate.bind(this), "Evaluate an expression in the current context", "e", "=")
        this.command("locals", this.locals.bind(this), "Display locals", "l")
        this.command("help", this.help.bind(this), "Print this message", "h", "?")
    }

    notification(context: DebugContext): Request {
        while (true) {
            const result = this.expectCommand(context)
            if (result) return result
        }
    }

    private lastCommand: string | undefined

    private expectCommand(context: DebugContext): Request | undefined {
        this.showPosition(context.location)
        process.stdout.write("> ")
        let line = readLine()
        if (line === undefined) process.exit(0)
        if (line == "" && this.lastCommand !== undefined) {
            line = this.lastCommand
        }
        this.lastCommand = line
        const [cmdName, ...args] = line.split(" ")
        const cmd = this.commands.get(cmdName)
        if (cmd !== undefined) {
            return cmd.execute(context, ...args)
        } else {
            console.log(`Unknown command: ${cmdName}. Use "help" for a list of commands`)
            return stopped
        }
    }

    private showPosition(location: number) {
        let pos: Position | undefined = undefined
        let lineText: string | undefined = undefined
        let loc = { start: location }
        const file = this.fileSet.file(loc)
        if (file !== undefined) {
            pos = file.position(loc)
            const text = this.fileText.get(file.fileName)
            if (text !== undefined) {
                if (pos) {
                    const range = file.lineRange(pos.line)
                    lineText = text.substring(range.start, range.end)
                }
            } else {
                console.log(`Text not found: ${file.fileName}`)
                console.log(this.fileText)
            }
        }
        if (pos && lineText) {
            console.log(`\n${pos.display()}\n${lineText}${padding(pos.column - 1)}^`)
        } else {
            console.log(`\n[${pos?.display() ?? `<unknown: ${location}>`}]`)
        }
    }

    private trace(context: DebugContext): undefined {
        const depth = context.stackDepth()
        const fileSet = this.fileSet
        for (let frameIndex = 0; frameIndex < depth; frameIndex++) {
            const frame = context.requestFrame(frameIndex)
            const location = fileSet.position({ start: frame.location })
            console.log(location?.display())
        }
        return stopped
    }

    private break(context: DebugContext, ...args: string[]): SetBreakpoints | undefined {
        if (args.length < 2 || args.length > 3) {
            console.log("Invalidate break location\nbreak <filename> <line> [<column>]")
            return stopped
        }
        const [fileSpec, lineText, columnText] = args
        if (!fileSpec) {
            console.log("Requires a file name parameter")
            return stopped
        }
        const fileName = this.findFile(fileSpec)
        if (!fileName) {
            console.log(`No file containing "${fileSpec}" found`)
            return stopped
        }
        if (lineText === undefined) {
            console.log("Requires a line number")
            return stopped
        }
        const line = tryParseInt(lineText)
        if (line === undefined) return stopped
        let column: number | undefined = undefined
        if (columnText != undefined) {
            column = tryParseInt(columnText)
            if (column === undefined) return stopped
        }

        const file = this.fileSet.find(fileName)
        if (file === undefined) {
            console.log(`File "${fileName}" not found in file set`)
            return stopped
        }
        const lineOffsets = file.lineRange(line)
        const startPos = file.pos(lineOffsets.start)
        const endPos = file.pos(lineOffsets.end)
        const locations = context.validBreakLocations(startPos, endPos)
        if (locations.length == 0) {
            console.log(`No break location found on line ${line}`)
            return stopped
        }

        for (const start of locations) {
            const position = file.position({ start })
            if (position)
                console.log(position.display())
        }

        return {
            kind: RequestKind.SetBreakpoints,
            locations
        }
    }

    private breaklist(context: DebugContext): undefined {
        const breakpoints = context.breakpointList()
        if (breakpoints.length == 0) {
            console.log("No breakpoints set")
        } else {
            for (const start of breakpoints) {
                console.log(this.fileSet.position({ start })?.display() ?? `<no source for ${start}`)
            }
        }
        return stopped
    }

    private clearBreakpoints(): ClearBreakpoints {
        return {
            kind: RequestKind.ClearBreakpoints
        }
    }

    private files(): undefined {
        for (const file of this.fileText.keys()) {
            console.log(file)
        }
        return stopped
    }

    private findFile(name: string): string | undefined {
        for (const file of this.fileText.keys()) {
            if (file.indexOf(name) >= 0) return file
        }
        return undefined
    }

    private evaluate(context: DebugContext, ...args: string[]): undefined {
        const expression = args.join(" ")
        const frame = context.requestFrame()
        const value = debugEvaluator(expression, frame.callContext)
        if (value.kind == NodeKind.Error) {
            console.log(`Error: ${value.message}`)
            return
        }
        console.log(valueToString(value))
        return stopped
    }

    private locals(context: DebugContext): undefined {
        const frame = context.requestFrame()
        const locals = frame.callContext[0]
        if (locals) {
            let index = 0
            for (const symbol of locals.symbols ?? []) {
                console.log(`${nameOfSymbol(symbol)}: ${valueToString(locals[index++])}`)
            }
        }
        return stopped
    }

    private help(): undefined {
        const definitions = this.definitions
        const names: string[] = []
        let width = 0
        for (const {name, shortNames} of definitions) {
            const text = shortNames.length > 0 ?
                `${name} (${shortNames.join(", ")}) ` : `${name} :`
            names.push(text)
            width = Math.max(width, text.length)
        }

        console.log("Commands:")
        names.forEach((name, index) => {
            console.log(`${name}${padding(width - name.length)}: ${definitions[index].description}`)
        })
        console.log()
        return stopped
    }

    private command(name: string, execute: (context: DebugContext, ...args: string[]) => Request | undefined, description: string, ...shortNames: string[]) {
        const command = { name, execute, description, shortNames }
        const commands = this.commands
        commands.set(name, command)
        for (const simpleName of shortNames) {
            commands.set(simpleName, command)
        }
        this.definitions.push(command)
    }
}

function padding(value: number): string {
    switch (value) {
        case 0: return ""
        case 1: return " "
        case 2: return "  "
        case 3: return "   "
        case 4: return "    "
    }
    const n = value >> 1
    return padding(n) + padding(n) + (value & 1 ? " " : "")
}

function readLine(): string | undefined {
    let buffer = Buffer.alloc(16)
    let offset = 0
    let result = ""
    while (true) {
        if (buffer.length == offset) {
            const newBuffer = Buffer.alloc(buffer.length + buffer.length / 2)
            buffer.copy(newBuffer, 0, 0, buffer.length)
            buffer = newBuffer
        }
        if (fs.readSync(0, buffer, offset, 1, null) != 1) {
            return undefined
        }
        if (buffer[offset] == 10) {
            result = buffer.slice(0, offset).toString('utf-8')
            break
        }
        offset++
    }
    return result
}

function tryParseInt(value: string, radix?: number): number | undefined {
    try {
        return parseInt(value, radix)
    } catch (e) {
        console.log(`The text "${value}" is not a valid number`)
        return undefined
    }
}