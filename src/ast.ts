export const enum NodeKind {
    Literal,
    Reference,
    Let,
    Binding,
    Import,
    Lambda,
    Call,
    Record,
    Member,
    Array,
    Select,
    Index,
    Quote,
    Splice,
    Projection,
    Match,
    MatchClause,
    Variable,
    Error
}

export const enum LiteralKind {
    Boolean,
    Int,
    Float,
    String,
    Null,
}

export interface NodeLike {
    kind: number
}

export interface LiteralBoolean {
    kind: NodeKind.Literal
    start: number
    literal: LiteralKind.Boolean
    value: boolean
}

export interface LiteralInt {
    kind: NodeKind.Literal
    start: number
    literal: LiteralKind.Int
    value: number
}

export interface LiteralFloat {
    kind: NodeKind.Literal
    start: number
    literal: LiteralKind.Float
    value: number
}

export interface LiteralString {
    kind: NodeKind.Literal
    start: number
    literal: LiteralKind.String
    value: string
}

export interface LiteralNull {
    kind: NodeKind.Literal
    start: number
    literal: LiteralKind.Null
    value: null
}

export type Literal =
    LiteralBoolean |
    LiteralInt |
    LiteralFloat |
    LiteralString |
    LiteralNull

export interface Reference {
    kind: NodeKind.Reference
    start: number
    name: string
}

export interface Let {
    kind: NodeKind.Let
    start: number
    bindings: Binding[]
    body: Expression
}

export interface Binding {
    kind: NodeKind.Binding
    start: number
    name: string
    value: Expression
}

export interface Import {
    kind: NodeKind.Import
    start: number
    name: string
}

export interface Lambda {
    kind: NodeKind.Lambda
    start: number
    parameters: string[]
    body: Expression
}

export interface Call {
    kind: NodeKind.Call
    start: number
    target: Expression
    args: Expression[]
}

export interface Record {
    kind: NodeKind.Record
    start: number
    members: (Member | Projection)[]
}

export interface Member {
    kind: NodeKind.Member
    start: number
    name: string
    value: Expression
}

export interface Array {
    kind: NodeKind.Array
    start: number
    values: (Expression | Projection)[]
}

export interface Select {
    kind: NodeKind.Select
    start: number
    target: Expression
    name: string
}

export interface Index {
    kind: NodeKind.Index
    start: number
    target: Expression
    index: Expression
}

export interface Quote {
    kind: NodeKind.Quote
    start: number
    target: Expression
}

export interface Splice {
    kind: NodeKind.Splice
    start: number
    target: Expression
}

export interface Projection {
    kind: NodeKind.Projection
    start: number
    value: Expression
}

export interface Match {
    kind: NodeKind.Match
    start: number
    target: Expression
    clauses: MatchClause[]
}

export interface MatchClause {
    kind: NodeKind.MatchClause
    start: number
    pattern: Expression
    value: Expression
}

export interface Variable {
    kind: NodeKind.Variable
    start: number
    name: string
}

export type Expression =
    Literal |
    Reference |
    Let |
    Import |
    Call |
    Lambda |
    Array |
    Record |
    Select |
    Index |
    Quote |
    Splice |
    Match |
    Projection |
    Variable

export type Node =
    Expression |
    Binding |
    Member |
    MatchClause
