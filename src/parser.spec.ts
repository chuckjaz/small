import { Array, Binding, Call, Expression, Index, Lambda, Let, LiteralFloat, LiteralInt, LiteralKind, LiteralNull, LiteralString, Match, MatchClause, Member, NodeKind, Projection, Record, Reference, Select } from "./ast"
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
        it("can parse a null", () => {
            expect(p("null")).toEqual(nl())
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
        it("can parse a projection of members", () => {
            expect(p("{x: 1, y: 2, ...other, z: 3}")).toEqual(
                rec(
                    m("x", i(1)),
                    m("y", i(2)),
                    pr(r("other")),
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
        it("can parse a array with a projecction", () => {
            expect(p("[1, ...a, 2]")).toEqual(a(i(1), pr(r("a")), i(2)))
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
            expect(p("let x = 1 in x")).toEqual(
                lt(r("x"), b("x", i(1)))
            )
        })
        it("can parse a multi-binding", () => {
            expect(p("let x = 1, y = 2, z = 3 in x(y(z))")).toEqual(
                lt(c(r("x"), c(r("y"), r("z"))), b("x", i(1)), b("y", i(2)), b("z", i(3)))
            )
        })
    })
    describe("match", () => {
        it("can parse an empty match", () => {
            expect(p("match e {}")).toEqual(mtch(r("e")))
        })
        it("can parse a single match clause", () => {
            expect(p("match e { a in b }")).toEqual(mtch(r("e"), cl(r("a"), r("b"))))
        })
        it("can parse multiple match clauses", () => {
            expect(p("match e { a in b, c in d, e in f }")).toEqual(
                mtch(
                    r("e"),
                    cl(r("a"), r("b")),
                    cl(r("c"), r("d")),
                    cl(r("e"), r("f"))
                )
            )
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
    const result = parse(lexer, "test")
    return result
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

function nl(): LiteralNull {
    return {
        kind: NodeKind.Literal,
        literal: LiteralKind.Null,
        value: null
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

function rec(...members: (Member | Projection)[]): Record {
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

function a(...values: (Expression | Projection)[]): Array {
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

function lt(body: Expression, ...bindings: Binding[]): Let {
    return {
        kind: NodeKind.Let,
        bindings,
        body
    }
}

function b(name: string, value: Expression): Binding {
    return {
        kind: NodeKind.Binding,
        name,
        value
    }
}

function pr(value: Expression): Projection {
    return {
        kind: NodeKind.Projection,
        value
    }
}

function mtch(target: Expression, ...clauses: MatchClause[]): Match {
    return {
        kind: NodeKind.Match,
        target,
        clauses
    }
}

function cl(pattern: Expression, value: Expression): MatchClause {
    return {
        kind: NodeKind.MatchClause,
        pattern,
        value
    }
}