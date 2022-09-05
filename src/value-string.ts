import { NodeKind } from "./ast"
import { dump } from "./ast-string"
import { Value, classToSymbols, nameOfSymbol, boundToString } from "./eval"

export function valueToString(value: Value): string {
    if (!value) return "<invalid value>"
    switch (value.kind) {
        case NodeKind.Literal: return dump(value)
        case NodeKind.Lambda: return `/(${value.arity}}.${boundToString(value.body)}`
        case NodeKind.Quote: return `'(${boundToString(value.target)})`
        case NodeKind.Array: return `[${value.values.map(v => valueToString(v)).join(", ")}]`
        case NodeKind.Record: {
            const symbols = classToSymbols(value.cls)
            return `{${value.values.map((v, i) => `${nameOfSymbol(symbols[i])}: ${valueToString(v)}`).join(", ")}}`
        }
        case NodeKind.Import: return `import '${value.name}'`
    }
}
