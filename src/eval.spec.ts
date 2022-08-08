import {
    Array, Binding, Call, Expression, Index, Lambda, Let, LiteralBoolean, LiteralInt, LiteralKind, Match, MatchClause, Member,  NodeKind, Pattern, Projection, Record, Reference, Select, Variable
} from "./ast"
import { ArrayValue, evaluate, RecordValue, Value, valueEquals, symbolOf } from "./eval"
import { dumpBound } from "./value-string"

describe("eval", () => {
    it("can evaluate an int literal", () => {
        evbx(i(10), i(10))
    })
    it("can evaluate a boolean literal", () => {
        evbx(bool(true), bool(true))
    })
    it("can call a lambda", () => {
        evbx(c(l(["x"], r("x")), i(10)), i(10))
    })
    it("can index", () => {
        evbx(idx(a(i(1), i(2), i(3)), i(1)), i(2))
    })
    it("can select", () => {
        const expr = sel(
            rec(
                m("one", i(1)),
                m("two", i(2))
            ),
            "two"
        )
        evbx(expr, i(2))
    })
    it("can let", () => {
        const expr = lt(
            r("x"),
            b("x", i(1))
        )
        evbx(expr, i(1))
    })
    it("can multi-let", () => {
        const expr = lt(
            rec(
                m("x", r("x")),
                m("y", r("y")),
                m("z", r("z"))
            ),
            b("x", i(1)),
            b("y", i(2)),
            b("z", i(3))
        )
        evbx(
            expr,
            brv(
                bmv("x", i(1)),
                bmv("y", i(2)),
                bmv("z", i(3))
            )
        )
    })
    it("can telescope", () => {
        const expr = lt(
            a(r("x"), r("y"), r("z")),
            b("x", i(1)),
            b("y", a(r("x"))),
            b("z", a(r("y")))
        )
        evbx(expr, bav(i(1), bav(i(1)), bav(bav(i(1)))))
    })
    describe("projection", () => {
        it("can project an array", () => {
            const expr = a(i(1), i(2), i(3), i(4))
            evbx(expr, bav(i(1), i(2), i(3), i(4)))
        })
        it("can multi-project an array", () => {
            const expr = a(i(1), pr(a(i(2))), i(3), pr(a(i(4))))
            evbx(expr, bav(i(1), i(2), i(3), i(4)))
        })
        it("can project a record", () => {
            const expr = rec(
                pr(
                    rec(
                        m("x", i(1))
                    )
                ),
                pr(
                    rec(
                        m("y", i(2))
                    )
                )
            )
            evbx(
                expr,
                brv(
                    bmv("x", i(1)),
                    bmv("y", i(2))
                )
            )
        })
    })
    describe("match", () => {
        it("can match an integer", () => {
            const expr = mtch(
                i(1),
                cl(i(1), i(2))
            )
            evbx(expr, i(2))
        })
        it("can match to a variable", () => {
            const expr = mtch(
                i(1),
                cl(v("x"), r("x"))
            )
            evbx(expr, i(1))
        })
        it("can match to an array", () => {
            const expr = mtch(
                a(i(1), i(2)),
                cl(ap(i(1), i(2)), i(3))
            )
            evbx(expr, i(3))
        })
        it("can match variables in an array", () => {
            const expr = mtch(
                a(i(1), i(2), i(3)),
                cl(ap(v("a"), v("b"), v("c")), a(r("c"), r("b"), r("a")))
            )
            evbx(expr, bav(i(3), i(2), i(1)))
        })
        it("can match a record", () => {
            const expr = mtch(
                rec(
                    m("x", i(1)),
                    m("y", i(2))
                ),
                cl(
                    rp(
                        mp("x", v("x")),
                        mp("y", v("y"))
                    ),
                    a(r("x"), r("y"))
                )
            )
            evbx(expr, bav(i(1), i(2)))
        })
        describe("projection", () => {
            it("can match a prefix of the array", () => {
                const expr = mtch(
                    a(i(1), i(2), i(3)),
                    cl(
                        ap(i(1), pp(v("x"))),
                        r("x")
                    )
                )
                evbx(expr, bav(i(2), i(3)))
            })
            it("can match the suffix of an array", () => {
                const expr = mtch(
                    a(i(1), i(2), i(3)),
                    cl(
                        ap(pp(v("x")), i(3)),
                        r("x")
                    )
                )
                evbx(expr, bav(i(1), i(2)))
            })
            it("can match the both prefix and suffix", () => {
                const expr = mtch(
                    a(i(1), i(2), i(3)),
                    cl(
                        ap(i(1), pp(v("x")), i(3)),
                        r("x")
                    )
                )
                evbx(expr, bav(i(2)))
            })
            it("can match a projected record", () => {
                const expr = mtch(
                    rec(
                        m("x", i(1)),
                        m("y", i(2)),
                        m("z", i(3))
                    ),
                    cl(
                        rp(
                            mp("x", v("x")),
                            pp(v("rest"))
                        ),
                        a(r("x"), r("rest"))
                    )
                )
                evbx(expr, bav(i(1), brv(bmv("y", i(2)), bmv("z", i(3)))))
            })
        })
    })
})

function i(value: number): LiteralInt {
    return {
        kind: NodeKind.Literal,
        literal: LiteralKind.Int,
        value
    }
}

function bool(value: boolean): LiteralBoolean {
    return {
        kind: NodeKind.Literal,
        literal: LiteralKind.Boolean,
        value
    }
}

function a(...values: (Expression | Projection<Expression>)[]): Array<Expression | Projection<Expression>> {
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

function r(name: string): Reference {
    return {
        kind: NodeKind.Reference,
        name
    }
}

function rec(...members: (Member<Expression> | Projection<Expression>)[]): Record<Member<Expression> | Projection<Expression>> {
    return {
        kind: NodeKind.Record,
        members
    }
}

function m(name: string, value: Expression): Member<Expression> {
    return {
        kind: NodeKind.Member,
        name,
        value
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

function pr(value: Expression): Projection<Expression> {
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

function cl(pattern: Expression | Variable | Pattern, value: Expression): MatchClause {
    return {
        kind: NodeKind.MatchClause,
        pattern,
        value
    }
}

function brv(...members: Member<Value>[]): RecordValue {
    const cls: number[] = []
    const values: Value[] = []
    for (const member of members) {
        cls[symbolOf(member.name)] = values.length
        values.push(member.value)
    }
    return {
        kind: NodeKind.Record,
        cls,
        values
    }
}

function bmv(name: string, value: Value): Member<Value> {
    return {
        kind: NodeKind.Member,
        name,
        value
    }
}

function bav(...values: Value[]): ArrayValue {
    return {
        kind: NodeKind.Array,
        values
    }
}

function rp(...members: (Member<Expression | Variable | Pattern> | Projection<Variable | Pattern>)[]): Pattern {
    return {
        kind: NodeKind.Pattern,
        pattern: {
            kind: NodeKind.Record,
            members
        }
    }
}

function mp(name: string, value: Expression | Variable | Pattern): Member<Expression | Variable | Pattern> {
    return {
        kind: NodeKind.Member,
        name,
        value
    }
}

function ap(...values: (Expression | Variable | Pattern | Projection<Variable | Pattern>)[]): Pattern {
    return {
        kind: NodeKind.Pattern,
        pattern: {
            kind: NodeKind.Array,
            values
        }
    }
}

function pp(value: Pattern | Variable): Projection<Pattern | Variable> {
    return {
        kind: NodeKind.Projection,
        value
    }
}

function v(name: string): Variable {
    return {
        kind: NodeKind.Variable,
        name
    }
}

export function evbx(value: Expression, expected: Value) {
    const result = evaluate(value)
    if (!valueEquals(result, expected)) {
        throw new Error(`Expected ${dumpBound(result)}, to equal ${dumpBound(expected)}`)
    }
}
