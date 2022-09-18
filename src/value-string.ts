import { NodeKind } from "./ast"
import { dump } from "./ast-string"
import { Value, classToSymbols, nameOfSymbol, boundToString } from "./eval"
import { FileSet } from "./files"

export function valueToString(value: Value, set?: FileSet): string {
    if (!value) return "<invalid value>"
    switch (value.kind) {
        case NodeKind.Literal: return dump(value)
        case NodeKind.Lambda: return `/(${value.arity}}.<code>`
        case NodeKind.Quote: return `'(${boundToString(value.target)})`
        case NodeKind.Array: return `[${value.values.map(v => valueToString(v, set)).join(", ")}]`
        case NodeKind.Record: {
            const symbols = classToSymbols(value.cls)
            return `{${value.values.map((v, i) => `${nameOfSymbol(symbols[i])}: ${valueToString(v, set)}`).join(", ")}}`
        }
        case NodeKind.Import: return `import '${value.name}'`
        case NodeKind.Error: {
            const stack = value.stack
            const position = set?.position(value)?.display()
            const location = position ? ` ${position}` : ''
            const stackDump = stack && set ? `\n  ${
                stack.map(v => set?.position({start: v})?.display()).join("\n  ")
            }` : ''
            return `Error${location}: ${value.message}${stackDump}`
        }
    }
}
