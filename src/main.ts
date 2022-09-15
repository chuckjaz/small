import { Lexer } from "./lexer";
import { parse } from "./parser";
import { evaluate, importedOf, Value } from "./eval";
import { Flags } from "./flags";

import * as fs from 'fs'
import * as path from 'path'
import { valueToString } from "./value-string";
import { Expression, LiteralBoolean, LiteralInt, LiteralKind, LiteralString, NodeKind } from "./ast";
import { fileSetBuilder, FileSetBuilder } from "./files";

const modules = new Map<string, Value>()
const setBuilder = fileSetBuilder()

function p(text: string, fileName: string): Expression {
    const file = setBuilder.file(fileName, text.length)
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
            const set = setBuilder.build()
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

function readFile(sourceFileName: string): string {
    return fs.readFileSync(sourceFileName, 'utf-8')
}

const flags = new Flags()

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
    const result = run(flags.args[0])
    console.log(valueToString(result, setBuilder.build()))
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

function numberOf(value: Value): number {
    if (value.kind == NodeKind.Literal && value.literal == LiteralKind.Int) return value.value
    incorrectValue("an integer", value)
}

function numberOfU(value: Value | undefined): number | undefined {
    if (value && value.kind == NodeKind.Literal && value.literal == LiteralKind.Int) return value.value
    return undefined
}

function stringOf(value: Value): string {
    if (value.kind == NodeKind.Literal && value.literal == LiteralKind.String) return value.value
    incorrectValue("an string", value)
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

function imports(name: string, relativeTo: string): Value {
    const mod = modules.get(name)
    if (mod !== undefined) return mod
    switch (name) {
        case "strings": return intrinsicsOf({
            concat: file => str(file.map(stringOf).join("")),
            sub: ([s, start, end]) => str(stringOf(s).substring(numberOf(start), numberOfU(end))),
            len: ([s]) => int(stringOf(s).length),
            code: ([s]) => int(stringOf(s).charCodeAt(0))
        })
        case "ints": return intrinsicsOf({
            add: ([left, right]) => int(numberOf(left) + numberOf(right)),
            sub: ([left, right]) => int(numberOf(left) - numberOf(right)),
            mul: ([left, right]) => int(numberOf(left) * numberOf(right)),
            div: ([left, right]) => int(numberOf(left) / numberOf(right)),
            less: ([left, right]) => bool(numberOf(left) < numberOf(right))
        })
    }

    const fileName = path.resolve(relativeTo, name)
    if (fs.existsSync(fileName)) {
        return run(fileName)
    }
    return {
        kind: NodeKind.Error,
        start: 0,
        message: `Cannot find '${name}'`
    }
}
