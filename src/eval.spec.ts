import { 
    Array, Binding, Call, Expression, Index, Lambda, Let, LiteralInt, LiteralKind, Member, NodeKind, Record, Reference, Select } from "./ast"
import { evaluate } from "./eval"

describe("eval", () => {
    it("can evaluate a literal", () => {
        expect(evaluate(i(10))).toEqual(i(10))        
    })
    it("can call a lambda", () => {
        expect(evaluate(c(l(["x"], r("x")), i(10)))).toEqual(i(10))
    })
    it("can index", () => {
        expect(evaluate(idx(a(i(1), i(2), i(3)), i(1)))).toEqual(i(2))
    })
    it("can select", () => {
        expect(
            evaluate(
                sel(
                    rec(
                        m("one", i(1)),
                        m("two", i(2))
                    ),
                    "two"
                )
            )
        ).toEqual(i(2))
    })
    it("can let", () => {
        expect(
            evaluate(
                lt(
                    r("x"),
                    b("x", i(1))
                )
            )
        ).toEqual(i(1))
    })
    it("can multi-let", () => {
        expect(
            evaluate(
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
        expect(
            evaluate(
                lt(
                    a(r("x"), r("y"), r("z")),
                    b("x", i(1)),
                    b("y", a(r("x"))),
                    b("z", a(r("y")))
                )
            )
        ).toEqual(
            a(i(1), a(i(1)), a(a(i(1))))
        )
    })
})

function i(value: number): LiteralInt {
    return {
        kind: NodeKind.Literal,
        literal: LiteralKind.Int,
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