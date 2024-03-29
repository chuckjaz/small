import { LiteralKind, Node, NodeKind } from "./ast";

export function nodeKindString(kind: NodeKind): string {
    switch (kind) {
        case NodeKind.Literal: return "Literal"
        case NodeKind.Reference: return "Reference"
        case NodeKind.Let: return "Let"
        case NodeKind.Binding: return "Binding"
        case NodeKind.Import: return "Import"
        case NodeKind.Lambda: return "Lambda"
        case NodeKind.Call: return "Call"
        case NodeKind.Record: return "Record"
        case NodeKind.Member: return "Member"
        case NodeKind.Array: return "Array"
        case NodeKind.Select: return "Select"
        case NodeKind.Index: return "Index"
        case NodeKind.Quote: return "Quote"
        case NodeKind.Splice: return "Splice"
        case NodeKind.Projection: return "Projection"
        case NodeKind.Match: return "Match"
        case NodeKind.MatchClause: return "MatchClause"
        case NodeKind.Variable: return "Variable"
        case NodeKind.Error: return "Error"
    }
}

export function literalKindString(kind: LiteralKind): string {
    switch (kind) {
        case LiteralKind.Boolean: "Boolean"
        case LiteralKind.Int: return "Int"
        case LiteralKind.Float: return "Float"
        case LiteralKind.String: return "String"
        case LiteralKind.Null: return "Null"
    }
}

export function dump(node: Node): string {
    switch (node.kind) {
        case NodeKind.Literal:
            switch (node.literal) {
                case LiteralKind.Boolean: return `${node.value}`
                case LiteralKind.Int: return `${node.value}`
                case LiteralKind.Float: return `${node.value}`
                case LiteralKind.String: return `"${node.value}"`
                case LiteralKind.Null: return 'null'
            }
        case NodeKind.Reference: return node.name
        case NodeKind.Let: return `let ${node.bindings.map(dump).join(", ")} in ${dump(node.body)}`
        case NodeKind.Binding: return `${node.name} = ${dump(node.value)}`
        case NodeKind.Import: return `import "${node.name}"`
        case NodeKind.Call: return `${dump(node.target)}(${node.args.map(dump).join(", ")})`
        case NodeKind.Lambda: return `\(${node.parameters.join(", ")})(${dump(node.body)})`
        case NodeKind.Record: return `{ ${node.members.map(dump).join(", ")} }`
        case NodeKind.Array: return `[ ${node.values.map(dump).join(", ")} ]`
        case NodeKind.Select: return `${dump(node.target)}.${node.name}`
        case NodeKind.Index: return `${dump(node.target)}[${dump(node.index)}]`
        case NodeKind.Member: return `${node.name}: ${dump(node.value)}`
        case NodeKind.Projection: return `...${dump(node.value)}`
        case NodeKind.Quote: return `'${dump(node.target)}`
        case NodeKind.Splice: return `$${dump(node.target)}`
        case NodeKind.Match: return `match { ${node.clauses.map(dump).join(", ")} }`
        case NodeKind.MatchClause: return `${dump(node.pattern)} in ${dump(node.value)}`
        case NodeKind.Variable: return `#${node.name}`
    }
}