import {
    Array, Binding, Call, Expression, Index, Lambda, Let, LiteralInt, LiteralKind, Match, MatchClause, Member, Node, NodeKind, Pattern, Projection, Record, Reference, Select, Variable
} from "./ast"
import { dump } from "./ast-string"
import { eq, evaluate, RuntimeRecord, Value } from "./eval"

describe("eval", () => {
    it("can evaluate a literal", () => {
        evx(i(10), i(10))
    })
    it("can call a lambda", () => {
        evx(c(l(["x"], r("x")), i(10)), i(10))
    })
    it("can index", () => {
        evx(idx(a(i(1), i(2), i(3)), i(1)), i(2))
    })
    it("can select", () => {
        evx(
            sel(
                rec(
                    m("one", i(1)),
                    m("two", i(2))
                ),
                "two"
            ),
            i(2)
        )
    })
    it("can let", () => {
        evx(
            lt(
                r("x"),
                b("x", i(1))
            ),
            i(1)
        )
    })
    it("can multi-let", () => {
        evx(
            lt(
                rec(
                    m("x", r("x")),
                    m("y", r("y")),
                    m("z", r("z"))
                ),
                b("x", i(1)),
                b("y", i(2)),
                b("z", i(3))
            ),
            rv(
                mv("x", i(1)),
                mv("y", i(2)),
                mv("z", i(3))
            )
        )
    })
    it("can telescope", () => {
        evx(
            lt(
                a(r("x"), r("y"), r("z")),
                b("x", i(1)),
                b("y", a(r("x"))),
                b("z", a(r("y")))
            ),
            av(i(1), av(i(1)), av(av(i(1))))
        )
    })
    describe("projection", () => {
        it("can project an array", () => {
            evx(
                a(i(1), pr(a(i(2), i(3))), i(4)),
                av(i(1), i(2), i(3), i(4))
            )
        })
        it("can multi-project an array", () => {
            evx(
                a(i(1), pr(a(i(2))), i(3), pr(a(i(4)))),
                av(i(1), i(2), i(3), i(4)))
        })
        it("can project a record", () => {
            evx(
                rec(
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
                ),
                rv(
                    mv("x", i(1)),
                    mv("y", i(2))
                )
            )
        })
    })
    describe("match", () => {
        it("can match an integer", () => {
            evx(
                mtch(
                    i(1),
                    cl(i(1), i(2))
                ),
                i(2)
            )
        })
        it("can match to a variable", () => {
            evx(
                mtch(
                    i(1),
                    cl(v("x"), r("x"))
                ),
                i(1)
            )
        })
        it("can match to an array", () => {
            evx(
                mtch(
                    a(i(1), i(2)),
                    cl(ap(i(1), i(2)), i(3))
                ),
                i(3)
            )
        })
        it("can match variables in an array", () => {
            evx(
                mtch(
                    a(i(1), i(2), i(3)),
                    cl(ap(v("a"), v("b"), v("c")), a(r("c"), r("b"), r("a")))
                ),
                av(i(3), i(2), i(1))
            )
        })
        it("can match a record", () => {
            evx(
                mtch(
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
                ),
                av(i(1), i(2))
            )
        })
        describe("projection", () => {
            it("can match a prefix of the array", () => {
                evx(
                    mtch(
                        a(i(1), i(2), i(3)),
                        cl(
                            ap(i(1), pp(v("x"))),
                            r("x")
                        )
                    ),
                    av(i(2), i(3))
                )
            })
            it("can match the suffix of an array", () => {
                evx(
                    mtch(
                        a(i(1), i(2), i(3)),
                        cl(
                            ap(pp(v("x")), i(3)),
                            r("x")
                        )
                    ),
                    av(i(1), i(2))
                )
            })
            it("can match the both prefix and suffix", () => {
                evx(
                    mtch(
                        a(i(1), i(2), i(3)),
                        cl(
                            ap(i(1), pp(v("x")), i(3)),
                            r("x")
                        )
                    ),
                    av(i(2))
                )
            })
            it("can match a projected record", () => {
                evx(
                    mtch(
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
                    ),
                    av(i(1), rv(mv("y", i(2)), mv("z", i(3))))
                )
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

function rv(...members: Member<Value>[]): RuntimeRecord {
    const map = new Map<string, Value>()
    members.forEach(m => map.set(m.name, m.value))
    return {
        kind: NodeKind.Record,
        members,
        map
    }
}

function mv(name: string, value: Value): Member<Value> {
    return {
        kind: NodeKind.Member,
        name,
        value
    }
}

function av(...values: Value[]): Array<Value> {
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

export function evx(value: Expression, expected: Value) {
    const result = evaluate(value)
    if (!eq(expected, result)) {
        throw new Error(`Expected ${dump(result)}, to equal ${dump(value)}`)
    }
    return expect(result)
}
