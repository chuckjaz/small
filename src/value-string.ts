import { NodeKind } from "./ast"
import { dump } from "./ast-string"
import { Value, classToSymbols, nameOfSymbol } from "./eval"

export function dumpBound(value: Value): string {
    if (!value) return "<invalid value>"
    switch (value.kind) {
        case NodeKind.Literal: return dump(value)
        case NodeKind.Lambda: return "lambda"
        case NodeKind.Array: return `[${value.values.map(v => dumpBound(v)).join(", ")}]`
        case NodeKind.Record: {
            const symbols = classToSymbols(value.cls)
            return `{${value.values.map((v, i) => `${nameOfSymbol(symbols[i])}: ${dumpBound(v)}`).join(", ")}}`
        }
    }
}
