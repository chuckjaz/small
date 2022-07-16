export const enum NodeKind {
    Literal,
    Reference,
    Let,
    Lambda,
    Call,
    Record,
    Member,
    Array,
    Select,
    Index,
}

export const enum LiteralKind {
    Int,
    Float,
    String,
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

export type Literal =
    LiteralInt |
    LiteralFloat |
    LiteralString

export interface Reference {
    kind: NodeKind.Reference
    name: string
}

export interface Let {
    kind: NodeKind.Let
    name: string
    value: Expression
    body: Expression
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
    members: Member[]
}

export interface Member {
    kind: NodeKind.Member
    name: string
    value: Expression
}

export interface Array {
    kind: NodeKind.Array
    values: Expression[]
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

export type Expression =
    Literal |
    Reference |
    Let |
    Call |
    Lambda |
    Array |
    Record |
    Select |
    Index

export type Node =
    Expression |
    Member
