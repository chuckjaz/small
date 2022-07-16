import { LiteralKind, Node, NodeKind } from "./ast";

export function nodeKindString(kind: NodeKind): string {
    switch (kind) {
        case NodeKind.Literal: return "Literal"
        case NodeKind.Reference: return "Reference"
        case NodeKind.Let: return "Let"
        case NodeKind.Lambda: return "Lambda"
        case NodeKind.Call: return "Call"
        case NodeKind.Record: return "Record"
        case NodeKind.Member: return "Member"
        case NodeKind.Array: return "Array"
        case NodeKind.Select: return "Select"
        case NodeKind.Index: return "Index"   
    }
}

export function literalKindString(kind: LiteralKind): string {
    switch (kind) {
        case LiteralKind.Int: return "Int"
        case LiteralKind.Float: return "Float"
        case LiteralKind.String: return "String"
    }
}

export function dump(node: Node): string {
    switch (node.kind) {
        case NodeKind.Literal:
            switch (node.literal) {
                case LiteralKind.Int: return `${node.value}`
                case LiteralKind.Float: return `${node.value}`
                case LiteralKind.String: return `"${node.value}"`
            }
        case NodeKind.Reference: return node.name
        case NodeKind.Let: return `let ${node.name} = ${dump(node.value)} in ${dump(node.body)}`
        case NodeKind.Call: return `${dump(node.target)}(${node.args.map(dump).join(", ")})`
        case NodeKind.Lambda: return `\(${node.parameters.join(", ")})(${dump(node.body)})`
        case NodeKind.Record: return `{ ${node.members.map(dump).join(", ")} }`
        case NodeKind.Array: return `[ ${node.values.map(dump).join(", ")} ]`
        case NodeKind.Select: return `${dump(node.target)}.${node.name}`
        case NodeKind.Index: return `${dump(node.target)}[${dump(node.index)}]`
        case NodeKind.Member: return `${node.name}: ${dump(node.value)}`
    }
}