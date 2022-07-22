import { Expression } from "./ast";
import { Lexer } from "./lexer";
import { parse } from "./parser";
import { evaluate } from "./eval";
import { Flags } from "./flags";

import * as fs from 'fs'
import { dump } from "./ast-string";

export function run(filename: string): Expression {
    const text = readFile(filename)
    const lexer = new Lexer(text)
    const value = parse(lexer, filename)
    const result = evaluate(value)
    return result
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
    console.log(dump(result))
} catch (e: any) {
    if ('line' in e) {
        console.log(e.message)
    } else {
        throw e
    }
}