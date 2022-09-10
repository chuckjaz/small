import { Array, Binding, Call, Expression, Index, Lambda, Let, LiteralFloat, LiteralInt, LiteralKind, LiteralNull, LiteralString, Match, MatchClause, Member, NodeKind, Projection, Record, Reference, Select, Variable } from "./ast"
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
            expect(p("match e { #a in b }")).toEqual(mtch(r("e"), cl(v("a"), r("b"))))
        })
        it("can parse multiple match clauses", () => {
            expect(p("match e { #a in b, #c in d, #e in f }")).toEqual(
                mtch(
                    r("e"),
                    cl(v("a"), r("b")),
                    cl(v("c"), r("d")),
                    cl(v("e"), r("f"))
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
    const zeroed = zeroStarts(result)
    return zeroed
}

function i(value: number): LiteralInt {
    return {
        kind: NodeKind.Literal,
        start: 0,
        literal: LiteralKind.Int,
        value
    }
}

function f(value: number): LiteralFloat {
    return {
        kind: NodeKind.Literal,
        start: 0,
        literal: LiteralKind.Float,
        value
    }
}

function s(value: string): LiteralString {
    return {
        kind: NodeKind.Literal,
        start: 0,
        literal: LiteralKind.String,
        value
    }
}

function nl(): LiteralNull {
    return {
        kind: NodeKind.Literal,
        start: 0,
        literal: LiteralKind.Null,
        value: null
    }
}

function r(name: string): Reference {
    return {
        kind: NodeKind.Reference,
        start: 0,
        name
    }
}

function l(names: string[], body: Expression): Lambda {
    return {
        kind: NodeKind.Lambda,
        start: 0,
        parameters: names,
        body
    }
}

function c(target: Expression, ...args: Expression[]): Call {
    return {
        kind: NodeKind.Call,
        start: 0,
        target,
        args
    }
}

function rec(...members: (Member | Projection)[]): Record {
    return {
        kind: NodeKind.Record,
        start: 0,
        members
    }
}

function m(name: string, value: Expression): Member {
    return {
        kind: NodeKind.Member,
        start: 0,
        name,
        value
    }
}

function a(...values: (Expression | Projection)[]): Array {
    return {
        kind: NodeKind.Array,
        start: 0,
        values
    }
}

function idx(target: Expression, index: Expression): Index {
    return {
        kind: NodeKind.Index,
        start: 0,
        target,
        index
    }
}

function sel(target: Expression, name: string): Select {
    return {
        kind: NodeKind.Select,
        start: 0,
        target,
        name
    }
}

function lt(body: Expression, ...bindings: Binding[]): Let {
    return {
        kind: NodeKind.Let,
        start: 0,
        bindings,
        body
    }
}

function b(name: string, value: Expression): Binding {
    return {
        kind: NodeKind.Binding,
        start: 0,
        name,
        value
    }
}

function pr(value: Expression): Projection {
    return {
        kind: NodeKind.Projection,
        start: 0,
        value
    }
}

function mtch(target: Expression, ...clauses: MatchClause[]): Match {
    return {
        kind: NodeKind.Match,
        start: 0,
        target,
        clauses
    }
}

function cl(pattern: Expression, value: Expression): MatchClause {
    return {
        kind: NodeKind.MatchClause,
        start: 0,
        pattern,
        value
    }
}

function v(name: string): Variable {
    return {
        kind: NodeKind.Variable,
        start: 0,
        name
    }
}

function zeroStarts(node: Expression): Expression {
    node.start = 0
    switch (node.kind) {
        case NodeKind.Let:
            for (const binding of node.bindings) {
                binding.start = 0
                zeroStarts(binding.value)
            }
            zeroStarts(node.body)
            break
        case NodeKind.Lambda:
            zeroStarts(node.body)
            break
        case NodeKind.Call:
            zeroStarts(node.target)
            node.args.forEach(zeroStarts)
            break
        case NodeKind.Record:
            node.members.forEach(m => {
                m.start = 0
                zeroStarts(m.value)
            })
            break
        case NodeKind.Array:
            node.values.forEach(zeroStarts)
            break
        case NodeKind.Select:
        case NodeKind.Quote:
        case NodeKind.Splice:
            zeroStarts(node.target)
            break
        case NodeKind.Index:
            zeroStarts(node.target)
            zeroStarts(node.index)
            break
        case NodeKind.Projection:
            zeroStarts(node.value)
            break
        case NodeKind.Match:
            zeroStarts(node.target)
            node.clauses.forEach(c => {
                c.start = 0
                zeroStarts(c.pattern)
                zeroStarts(c.value)
            })
            break
    }
    return node
}