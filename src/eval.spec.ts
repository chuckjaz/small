import {
    Array, Binding, Call, Expression, Index, Lambda, Let, LiteralInt, LiteralKind, Match, MatchClause, Member, Node, NodeKind, Projection, Record, Reference, Select
} from "./ast"
import { evaluate } from "./eval"

describe("eval", () => {
    it("can evaluate a literal", () => {
        evx(i(10)).toEqual(i(10))
    })
    it("can call a lambda", () => {
        evx(c(l(["x"], r("x")), i(10))).toEqual(i(10))
    })
    it("can index", () => {
        evx(idx(a(i(1), i(2), i(3)), i(1))).toEqual(i(2))
    })
    it("can select", () => {
        evx(
            sel(
                rec(
                    m("one", i(1)),
                    m("two", i(2))
                ),
                "two"
            )
        ).toEqual(i(2))
    })
    it("can let", () => {
        evx(
            lt(
                r("x"),
                b("x", i(1))
            )
        ).toEqual(i(1))
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
            )
        ).toEqual(
            rec(
                m("x", i(1)),
                m("y", i(2)),
                m("z", i(3))
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
            )
        ).toEqual(
            a(i(1), a(i(1)), a(a(i(1))))
        )
    })
    describe("projection", () => {
        it("can project an array", () => {
            evx(
                a(i(1), pr(a(i(2), i(3))), i(4))
            ).toEqual(
                a(i(1), i(2), i(3), i(4))
            )
        })
        it("can multi-project an array", () => {
            evx(
                a(i(1), pr(a(i(2))), i(3), pr(a(i(4))))
            ).toEqual(a(i(1), i(2), i(3), i(4)))
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
                )
            ).toEqual(
                rec(
                    m("x", i(1)),
                    m("y", i(2))
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
                )
        ).toEqual(i(2))
        })
        it("can match to a variable", () => {
            evx(
                mtch(
                    i(1),
                    cl(r("x"), r("x"))
                )
            ).toEqual(i(1))
        })
        it("can match to an array", () => {
            evx(
                mtch(
                    a(i(1), i(2)),
                    cl(a(i(1), i(2)), i(3))
                )
            ).toEqual(i(3))
        })
        it("can match variables in an array", () => {
            evx(
                mtch(
                    a(i(1), i(2), i(3)),
                    cl(a(r("a"), r("b"), r("c")), a(r("c"), r("b"), r("a")))
                )
            ).toEqual(a(i(3), i(2), i(1)))
        })
        it("can match a record", () => {
            evx(
                mtch(
                    rec(
                        m("x", i(1)),
                        m("y", i(2))
                    ),
                    cl(
                        rec(
                            m("x", r("x")),
                            m("y", r("y"))
                        ),
                        a(r("x"), r("y"))
                    )
                )
            ).toEqual(a(i(1), i(2)))
        })
        describe("projection", () => {
            it("can match a prefix of the array", () => {
                evx(
                    mtch(
                        a(i(1), i(2), i(3)),
                        cl(
                            a(i(1), pr(r("x"))),
                            r("x")
                        )
                    )
                ).toEqual(a(i(2), i(3)))
            })
            it("can match the suffix of an array", () => {
                evx(
                    mtch(
                        a(i(1), i(2), i(3)),
                        cl(
                            a(pr(r("x")), i(3)),
                            r("x")
                        )
                    )
                ).toEqual(a(i(1), i(2)))
            })
            it("can match the both prefix and suffix", () => {
                evx(
                    mtch(
                        a(i(1), i(2), i(3)),
                        cl(
                            a(i(1), pr(r("x")), i(3)),
                            r("x")
                        )
                    )
                ).toEqual(a(i(2)))
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
                            rec(
                                m("x", r("x")),
                                pr(r("rest"))
                            ),
                            a(r("x"), r("rest"))
                        )
                    )
                ).toEqual(a(i(1), rec(m("y", i(2)), m("z", i(3)))))
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

function evx(value: Expression): jasmine.Matchers<Expression> {
    const result = evaluate(value)
    removeRuntimeCaches(result)
    return expect(result)
}

function removeRuntimeCaches(value: Node) {
    switch (value.kind) {
        case NodeKind.Literal:
        case NodeKind.Reference:
            break
        case NodeKind.Let:
            value.bindings.forEach(removeRuntimeCaches)
            removeRuntimeCaches(value.body)
            break
        case NodeKind.Binding:
            removeRuntimeCaches(value.value)
            break
        case NodeKind.Lambda:
            removeRuntimeCaches(value.body)
            break
        case NodeKind.Call:
            removeRuntimeCaches(value.target)
            value.args.forEach(removeRuntimeCaches)
            break
        case NodeKind.Record:
            value.members.forEach(removeRuntimeCaches)
            delete (value as any).map
            break
        case NodeKind.Member:
            removeRuntimeCaches(value.value)
            break
        case NodeKind.Array:
            value.values.forEach(removeRuntimeCaches)
            break
        case NodeKind.Select:
            removeRuntimeCaches(value.target)
            break
        case NodeKind.Index:
            removeRuntimeCaches(value.target)
            removeRuntimeCaches(value.index)
            break
        case NodeKind.Projection:
            break
        case NodeKind.Match:
            removeRuntimeCaches(value.target)
            value.clauses.forEach(removeRuntimeCaches)
            break
        case NodeKind.MatchClause:
            removeRuntimeCaches(value.value)
            break
    }
}