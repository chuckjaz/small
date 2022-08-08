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
    Pattern,
    Variable,
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
    literal: LiteralKind.Boolean
    value: boolean
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
    LiteralBoolean |
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

export interface Record<M extends NodeLike> {
    kind: NodeKind.Record
    members: M[]
}

export interface Member<T extends NodeLike> {
    kind: NodeKind.Member
    name: string
    value: T
}

export interface Array<T extends NodeLike> {
    kind: NodeKind.Array
    values: T[]
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

export interface Projection<T extends NodeLike> {
    kind: NodeKind.Projection
    value: T
}

export interface Match {
    kind: NodeKind.Match
    target: Expression
    clauses: MatchClause[]
}

export interface MatchClause {
    kind: NodeKind.MatchClause
    pattern: Expression | Variable | Pattern
    value: Expression
}

export interface Variable {
    kind: NodeKind.Variable
    name: string
}

export interface Pattern {
    kind: NodeKind.Pattern
    pattern: Array<Expression | Pattern | Variable | Projection<Pattern | Variable>> |
        Record<Member<Expression |  Pattern | Variable> | Projection<Pattern | Variable>>
}

export type Expression =
    Literal |
    Reference |
    Let |
    Call |
    Lambda |
    Array<Expression | Projection<Expression>> |
    Record<Member<Expression> | Projection<Expression>> |
    Select |
    Index |
    Match

export type Node =
    Expression |
    Binding |
    Member<Expression | Pattern | Variable> |
    Projection<Expression | Pattern | Variable> |
    Array<Expression | Pattern | Variable | Projection<Pattern | Variable>> |
    Record<Member<Expression |  Pattern | Variable> | Projection<Pattern | Variable>> |
    MatchClause |
    Pattern |
    Variable
