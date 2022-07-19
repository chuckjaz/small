export const enum NodeKind {
    Literal,
    Reference,
    Let,
    Binding,
    Lambda,
    Call,
    Record,
    Member,
    Array,
    Select,
    Index,
    Projection,
    Match,
    MatchClause,
}

export const enum LiteralKind {
    Int,
    Float,
    String,
    Null,
}

export interface LiteralInt {
    kind: NodeKind.Literal
    literal: LiteralKind.Int
    value: number
}

export interface LiteralFloat {
    kind: NodeKind.Literal
    literal: LiteralKind.Float
    value: number
}

export interface LiteralString {
    kind: NodeKind.Literal
    literal: LiteralKind.String
    value: string
}

export interface LiteralNull {
    kind: NodeKind.Literal
    literal: LiteralKind.Null
    value: null
}

export type Literal =
    LiteralInt |
    LiteralFloat |
    LiteralString |
    LiteralNull

export interface Reference {
    kind: NodeKind.Reference
    name: string
}

export interface Let {
    kind: NodeKind.Let
    bindings: Binding[]
    body: Expression
}

export interface Binding {
    kind: NodeKind.Binding
    name: string
    value: Expression
}

export interface Lambda {
    kind: NodeKind.Lambda
    parameters: string[]
    body: Expression
}

export interface Call {
    kind: NodeKind.Call
    target: Expression
    args: Expression[]
}

export interface Record {
    kind: NodeKind.Record
    members: (Member | Projection)[]
}

export interface Member {
    kind: NodeKind.Member
    name: string
    value: Expression
}

export interface Array {
    kind: NodeKind.Array
    values: (Expression | Projection)[]
}

export interface Select {
    kind: NodeKind.Select
    target: Expression
    name: string
}

export interface Index {
    kind: NodeKind.Index
    target: Expression
    index: Expression
}

export interface Projection {
    kind: NodeKind.Projection
    value: Expression
}

export interface Match {
    kind: NodeKind.Match
    target: Expression
    clauses: MatchClause[]
}

export interface MatchClause {
    kind: NodeKind.MatchClause
    pattern: Expression
    value: Expression
}

export type Expression =
    Literal |
    Reference |
    Let |
    Call |
    Lambda |
    Array |
    Record |
    Select |
    Index |
    Match

export type Node =
    Expression |
    Binding |
    Member |
    Projection |
    MatchClause
