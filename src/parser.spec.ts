import { Array, Call, Expression, Index, Lambda, Let, LiteralFloat, LiteralInt, LiteralKind, LiteralString, Member, NodeKind, Record, Reference, Select } from "./ast"
import { Lexer } from "./lexer"
import { parse } from "./parser"

describe("parser", () => {
    describe("literals", () => {
        it("can parse an int", () => {
            expect(p("1")).toEqual(i(1))
        })
        it("can parse a float", () => {
            expect(p("1.0")).toEqual(f(1.0))
        })
        it("can parse a string", () => {
            expect(p('"abc"')).toEqual(s("abc"))
        })
        it("can parse a reference", () => {
            expect(p("abc")).toEqual(r("abc"))
        })
    })
    describe("record", () => {
        it("can parse an empty record", () => {
            expect(p("{}")).toEqual(rec())
        })
        it("can parse a single member", () => {
            expect(p("{x:1}")).toEqual(rec(m("x", i(1))))
        })
        it("can parse multiple members", () => {
            expect(p("{x: 1, y: 2, z: 3}")).toEqual(
                rec(
                    m("x", i(1)),
                    m("y", i(2)),
                    m("z", i(3))
                )
            )
        })
        it("can select a member", () => {
            expect(p("x.y")).toEqual(sel(r("x"), "y"))
        })
    })
    describe("array", () => {
        it("can parse empty array", () => {
            expect(p("[]")).toEqual(a())
        })
        it("can parse a single value array", () => {
            expect(p("[1]")).toEqual(a(i(1)))
        })
        it("can parse multiple values in an array", () => {
            expect(p("[1, 2, 3]")).toEqual(a(i(1), i(2), i(3)))
        })
        it("can index an array", () => {
            expect(p("a[b]")).toEqual(idx(r("a"), r("b")))
        })
        it("can index a matrix", () => {
            expect(p("a[b][c]")).toEqual(idx(idx(r("a"), r("b")), r("c")))
        })
    })
    describe("lambda", () => {
        it("can parse a single parameter", () => {
            expect(p("/x.x")).toEqual(l(["x"], r("x")))
        })
        it("can parse multiple parameters", () => {
            expect(p("/(x,y).x(y)")).toEqual(
                l(["x", "y"], c(r("x",), r("y")))
            )
        })
        it("can call a lambda with no parameters", () => {
            expect(p("a()")).toEqual(c(r("a")))
        })
        it("can call a lambda with one parameter", () => {
            expect(p("a(b)")).toEqual(c(r("a"), r("b")))
        })
        it("can call a lambda with multiple parameters", () => {
            expect(p("a(b, c, d)")).toEqual(c(r("a"), r("b"), r("c"), r("d")))
        })
    })
    describe("let", () => {
        it("can parse a let", () => {
            expect(p("let x = 1 in x")).toEqual(lt("x", i(1), r("x")))
        })
    })
    describe("parens", () => {
        it("can parse a paren expression", () => {
            expect(p("(x)")).toEqual(r("x"))
        })
    })
})

function p(text: string): Expression {
    const lexer = new Lexer(text)
    return parse(lexer, "test")
}

function i(value: number): LiteralInt {
    return {
        kind: NodeKind.Literal,
        literal: LiteralKind.Int,
        value
    }
}

function f(value: number): LiteralFloat {
    return {
        kind: NodeKind.Literal,
        literal: LiteralKind.Float,
        value
    }
}

function s(value: string): LiteralString {
    return {
        kind: NodeKind.Literal,
        literal: LiteralKind.String,
        value
    }
}

function r(name: string): Reference {
    return {
        kind: NodeKind.Reference,
        name
    }
}

function l(names: string[], body: Expression): Lambda {
    return {
        kind: NodeKind.Lambda,
        parameters: names,
        body
    }
}

function c(target: Expression, ...args: Expression[]): Call {
    return {
        kind: NodeKind.Call,
        target,
        args
    }
}

function rec(...members: Member[]): Record {
    return {
        kind: NodeKind.Record,
        members
    }
}

function m(name: string, value: Expression): Member {
    return {
        kind: NodeKind.Member,
        name,
        value
    }
}

function a(...values: Expression[]): Array {
    return {
        kind: NodeKind.Array,
        values
    }
}

function idx(target: Expression, index: Expression): Index {
    return {
        kind: NodeKind.Index,
        target,
        index
    }
}

function sel(target: Expression, name: string): Select {
    return {
        kind: NodeKind.Select,
        target,
        name
    }
}

function lt(name: string, value: Expression, body: Expression): Let {
    return {
        kind: NodeKind.Let,
        name,
        value,
        body
    }
}