import { Lexer } from "./lexer";
import { parse } from "./parser";
import { ArrayValue, ErrorValue, evaluate, importedOf, Value } from "./eval";
import { Flags } from "./flags";

import * as fs from 'fs'
import * as path from 'path'
import { valueToString } from "./value-string";
import { Expression, LiteralBoolean, LiteralInt, LiteralKind, LiteralString, NodeKind } from "./ast";
import { fileSet } from "./files";
import { debug } from "./debug";
import { TextDebugger } from "./text-debug";

const modules = new Map<string, Value>()
const set = fileSet()

function p(text: string, fileName: string): Expression {
    const file = set.declare(fileName, text.length)
    const lexer = new Lexer(text, file)
    const result = parse(lexer, fileName)
    file.build()
    return result
}

export function run(fileName: string): Value {
    try {
        const dirName = path.dirname(fileName)
        const text = readFile(fileName)
        const value = p(text, fileName)
        const result = evaluate(value, (name) => imports(name, dirName))
        return result
    } catch (e) {
        if ('start' in (e as any)) {
            const position = set.position(e as any)
            if (position) {
                console.log(`${position.display()}: ${(e as any).message}`)
                return {
                    kind: NodeKind.Literal,
                    start: 0,
                    literal: LiteralKind.Null,
                    value: null
                }
            }
        }
        throw e
    }
}

export function runDebug(fileName: string): Value {
    try {
        const dirName = path.dirname(fileName)
        const text = readFile(fileName)
        const value = p(text, fileName)
        const controller = new TextDebugger(set, fileText)
        const result = debug(
            value,
            controller,
            (name) => imports(name, dirName)
        )
        return result
    } catch (e) {
        if ('start' in (e as any)) {
            const position = set.position(e as any)
            if (position) {
                console.log(`${position.display()}: ${(e as any).message}`)
                return {
                    kind: NodeKind.Literal,
                    start: 0,
                    literal: LiteralKind.Null,
                    value: null
                }
            }
        }
        throw e
    }
}

let fileText: Map<string, string>
function readFile(sourceFileName: string): string {
    const text =  fs.readFileSync(sourceFileName, 'utf-8')
    fileText?.set(sourceFileName, text)
    return text
}

const flags = new Flags()

flags.boolean("debug", "Debug the file", false, "d")

flags.parse(process.argv.slice(2))

if (flags.helpRequested) {
    console.log(`small [<options>] <filename>`)
    console.log(flags.helpText())
    process.exit(1)
}

if (flags.args.length != 1) {
    console.log(`Expected a single file name`)
    process.exit(2)
}


try {
    const filename = flags.args[0]
    if (flags.options.debug) {
        fileText = new Map()
    }
    const result = flags.options.debug ? runDebug(filename) : run(filename)
    console.log(valueToString(result, set))
} catch (e: any) {
    if ('line' in e) {
        console.log(e.message)
    } else {
        throw e
    }
}

function error(message: string): never {
    throw new Error(message)
}

type ImportedFuntion = (file: Value[]) => Value

function intrinsicsOf(obj: { [name: string]: ImportedFuntion }): Value {
    function intrinsicImport(name: string): Value {
        const result = obj[name]
        if (result == undefined) error(`Internal error: Unknown intrinsic '${name}'`)
        return importedOf(name, result)
    }

    const names = Object.getOwnPropertyNames(obj)
    const src = `let ${
        names.map(name => `${name} = import "${name}"`).join(", ")
    } in { ${names.join(", ")} }`
    const expression = p(src, "<intrinsic>")
    return evaluate(expression, intrinsicImport)
}

function incorrectValue(spec: string, value: Value): never {
    error(`Required ${spec}, but received ${valueToString(value)}`)
}

function booleanOf(value: Value): boolean {
    if (value.kind == NodeKind.Literal && value.literal == LiteralKind.Boolean) return value.value
    incorrectValue("a boolean", value)
}

function numberOf(value: Value): number {
    if (value.kind == NodeKind.Literal && value.literal == LiteralKind.Int) return value.value
    incorrectValue("an integer", value)
}

function opNumberOf(value: Value | undefined): number | undefined {
    if (value && value.kind == NodeKind.Literal && value.literal == LiteralKind.Int) return value.value
    return undefined
}

function stringOf(value: Value): string {
    if (value.kind == NodeKind.Literal && value.literal == LiteralKind.String) return value.value
    incorrectValue("a string", value)
}

function opStringOf(value: Value | undefined): string | undefined {
    if (value) return stringOf(value)
    return undefined
}

function arrayOf(value: Value): Value[] {
    if (value.kind == NodeKind.Array) return value.values
    incorrectValue("an array", value)
}

function bool(value: boolean): LiteralBoolean {
    return {
        kind: NodeKind.Literal,
        start: 0,
        literal: LiteralKind.Boolean,
        value
    }
}

function int(value: number): LiteralInt {
    return {
        kind: NodeKind.Literal,
        start: 0,
        literal: LiteralKind.Int,
        value
    }
}

function str(value: string): LiteralString {
    return {
        kind: NodeKind.Literal,
        start: 0,
        literal: LiteralKind.String,
        value
    }
}

function arr(values: Value[]): ArrayValue {
    return {
        kind: NodeKind.Array,
        values
    }
}

function recordModule(name: string, module: Value): Value {
    modules.set(name, module)
    return module
}

function extendArray(a: Value[], size: number, value: Value): Value[] {
    if (a.length >= size) return a
    const result = [...a]
    while (result.length < size) result.push(value)
    return result
}

function arraySet(a: Value[], index: number, value: Value): Value[] {
    const result = [...a]
    result[index] = value
    return result
}

function imports(name: string, relativeTo: string): Value {
    const mod = modules.get(name)
    if (mod !== undefined) return mod
    switch (name) {
        case "strings": return recordModule(name, intrinsicsOf({
            concat: file => str(file.map(stringOf).join("")),
            sub: ([s, start, end]) => str(stringOf(s).substring(numberOf(start), opNumberOf(end))),
            len: ([s]) => int(stringOf(s).length),
            code: ([s]) => int(stringOf(s).charCodeAt(0)),
            join: ([a, p]) => str(arrayOf(a).map(v => stringOf(v)).join(opStringOf(p)))
        }))
        case "arrays": return recordModule(name, intrinsicsOf({
            len: ([a]) => int(arrayOf(a).length),
            slice: ([a, start, end]) => arr(arrayOf(a).slice(numberOf(start), opNumberOf(end))),
            extend: ([a, size, value]) => arr(extendArray(arrayOf(a), numberOf(size), value)),
            set: ([a, index, value]) => arr(arraySet(arrayOf(a), numberOf(index), value)),
            "set!": ([a, index, value]) => {
                const arr = arrayOf(a)
                arr[numberOf(index)] = value
                return a
            },
        }))
        case "ints": return recordModule(name, intrinsicsOf({
            add: ([left, right]) => int(numberOf(left) + numberOf(right)),
            sub: ([left, right]) => int(numberOf(left) - numberOf(right)),
            mul: ([left, right]) => int(numberOf(left) * numberOf(right)),
            div: ([left, right]) => int(numberOf(left) / numberOf(right)),
            less: ([left, right]) => bool(numberOf(left) < numberOf(right)),
            string: ([value]) => str(`${numberOf(value)}`)
        }))
        case "bools": return recordModule(name, intrinsicsOf({
            string: ([value]) => str(`${booleanOf(value)}`)
        }))
        case "logs": return recordModule(name, intrinsicsOf({
            log: file => { console.log(file.map(v => valueToString(v, set)).join(", ")); return file[file.length - 1] },
            error: ([message]) => errorValue(valueToString(message))
        }))
        case "files": return recordModule(name, intrinsicsOf({
            readFile: ([fileName]) => str(fs.readFileSync(stringOf(fileName), 'utf-8'))
        }))
    }

    const fileName = path.resolve(relativeTo, name)
    const fileMod = modules.get(fileName)
    if (fileMod !== undefined) return fileMod
    if (fs.existsSync(fileName)) {
        return recordModule(fileName, flags.options.debug ? runDebug(fileName) : run(fileName))
    }
    return errorValue(`Cannot find '${name}'`)
}

function errorValue(message: string): ErrorValue {
    return {
        kind: NodeKind.Error,
        start: 0,
        message
    }
}