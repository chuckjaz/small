import {
    Array, Binding, Call, Expression, Import, Index, Lambda, Let, LiteralBoolean, LiteralInt, LiteralKind, LiteralString, Match, MatchClause, Member,  NodeKind, Projection, Record, Reference, Select, Variable
} from "./ast"
import { ArrayValue, evaluate, RecordValue, Value, valueEquals, symbolOf, importedOf } from "./eval"
import { valueToString } from "./value-string"

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
                cl(a(i(1), i(2)), i(3))
            )
            evbx(expr, i(3))
        })
        it("can match variables in an array", () => {
            const expr = mtch(
                a(i(1), i(2), i(3)),
                cl(a(v("a"), v("b"), v("c")), a(r("c"), r("b"), r("a")))
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
                    rec(
                        m("x", v("x")),
                        m("y", v("y"))
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
                        a(i(1), pr(v("x"))),
                        r("x")
                    )
                )
                evbx(expr, bav(i(2), i(3)))
            })
            it("can match the suffix of an array", () => {
                const expr = mtch(
                    a(i(1), i(2), i(3)),
                    cl(
                        a(pr(v("x")), i(3)),
                        r("x")
                    )
                )
                evbx(expr, bav(i(1), i(2)))
            })
            it("can match the both prefix and suffix", () => {
                const expr = mtch(
                    a(i(1), i(2), i(3)),
                    cl(
                        a(i(1), pr(v("x")), i(3)),
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
                        rec(
                            m("x", v("x")),
                            pr(v("rest"))
                        ),
                        a(r("x"), r("rest"))
                    )
                )
                evbx(expr, bav(i(1), brv(bmv("y", i(2)), bmv("z", i(3)))))
            })
        })
    })
    describe("imports", () => {
        function im(body: Expression): Expression {
            return lt(body,
                b("iadd", imp("int.add")),
                b("isub", imp("int.sub")),
                b("imul", imp("int.mul")),
                b("idiv", imp("int.div")),
                b("iless", imp("int.less")),
                b("len", imp("array.len"))
            )
        }
        it("can add two integers", () => {
            evbx(im(c(r("iadd"), i(21), i(21))), i(21 + 21))
        })
        it("can substract two integers", () => {
            evbx(im(c(r("isub"), i(52), i(10))), i(52 - 10))
        })
        it("can multiply two integers", () => {
            evbx(im(c(r("imul"), i(6), i(7))), i(6 * 7))
        })
        it("can divide two integers", () => {
            evbx(im(c(r("idiv"), i(84), i(2))), i(84 / 2))
        })
        it("can compare two integers", () => {
            evbx(im(c(r("iless"), i(23), i(42))), bool(23 < 42))
        })
        it("can get the length of a string", () => {
            evbx(im(c(r("len"), str("Value"))), i(5))
        })
        it("can get the length of an array", () => {
            evbx(im(c(r("len"), a(i(0), i(1), i(2)))), i(3))
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

function a(...values: (Expression | Projection)[]): Array {
    return {
        kind: NodeKind.Array,
        values
    }
}

function imp(name: string): Import {
    return {
        kind: NodeKind.Import,
        name
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

interface ValueMember {
    name: string
    value: Value
}

function brv(...members: ValueMember[]): RecordValue {
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

function bmv(name: string, value: Value): ValueMember {
    return {
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

function v(name: string): Variable {
    return {
        kind: NodeKind.Variable,
        name
    }
}

export function evbx(value: Expression, expected: Value) {
    const result = evaluate(value, simpleImports)
    if (!valueEquals(result, expected)) {
        throw new Error(`Expected ${valueToString(result)}, to equal ${valueToString(expected)}`)
    }
}

function error(message: string): never {
    throw Error(message)
}

function toInt(value: Value): number {
    if (value && value.kind == NodeKind.Literal && value.literal == LiteralKind.Int) {
        return value.value
    }
    error("Required an integer")
}

function toIntU(value: Value | undefined): number | undefined {
    return value === undefined ? undefined : toInt(value)
}

function toLengthable(value: Value): { length: number } {
    if (value) {
        switch (value.kind) {
            case NodeKind.Literal:
                if (value.literal == LiteralKind.String) return value.value
                break
            case NodeKind.Array:
                return value.values
        }
    }
    error("Require an array or string")
}

function toString(value: Value): string {
    if (value && value.kind == NodeKind.Literal && value.literal == LiteralKind.String) {
        return value.value
    }
    error("Required a string")
}

function str(value: string): LiteralString {
    return {
        kind: NodeKind.Literal,
        literal: LiteralKind.String,
        value
    }
}

export function simpleImports(name: string): Value {
    switch (name) {
        case "int.add": return importedOf("add", ([left, right]) => i(toInt(left) + toInt(right)))
        case "int.sub": return importedOf("sub", ([left, right]) => i(toInt(left) - toInt(right)))
        case "int.mul": return importedOf("mul", ([left, right]) => i(toInt(left) * toInt(right)))
        case "int.div": return importedOf("div", ([left, right]) => i(toInt(left) / toInt(right)))
        case "int.less": return importedOf("less", ([left, right]) => bool(toInt(left) < toInt(right)))
        case "array.len":
        case "string.len": return importedOf("len", ([target]) => i(toLengthable(target).length))
        case "string.concat": return importedOf("concat", file => str(file.map(toString).join("")))
        case "string.less": return importedOf("less", ([left, right]) => bool(toString(left) < toString(right)))
        case "string.sub": return importedOf("sub", ([s, start, end]) => str(toString(s).substring(toInt(start), toIntU(end))))
        default: error(`Could not import '${name}'`)
    }
}
