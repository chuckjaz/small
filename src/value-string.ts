import { NodeKind } from "./ast"
import { dump } from "./ast-string"
import { Value, classToSymbols, nameOfSymbol, boundToString } from "./eval"
import { FileSet } from "./files"

export function valueToString(value: Value, set?: FileSet): string {
    if (!value) return "<invalid value>"
    const displayed = new Set<any>()
    function val(value: Value): string {
        switch (value.kind) {
            case NodeKind.Literal: return dump(value)
            case NodeKind.Lambda: return `/(${value.arity}}.<code>`
            case NodeKind.Quote: return `'(${boundToString(value.target)})`
            case NodeKind.Array: {
                if (displayed.has(value)) return "<recursive array>"
                displayed.add(value)
                return `[${value.values.map(v => val(v)).join(", ")}]`
            }
            case NodeKind.Record: {
                if (displayed.has(value)) return "<recursive record>"
                displayed.add(value)
                const symbols = classToSymbols(value.cls)
                return `{${value.values.map((v, i) => `${nameOfSymbol(symbols[i])}: ${val(v)}`).join(", ")}}`
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
    return val(value)
}
