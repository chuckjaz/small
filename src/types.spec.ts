import { Expression } from "./ast"
import { Lexer } from "./lexer"
import { parse } from "./parser"
import { ArrayType, check, IntType, RecordType, RecordTypeMember, StringType, Type, TypeKind, typeToString } from "./types"

describe("types", () => {
    describe("literals", () => {
        it("should infer true to be a boolean", () => {
            expectKind('true', TypeKind.Boolean)
        })
        it("should infer false to be a boolean", () => {
            expectKind(`false`, TypeKind.Boolean)
        })
        it("should infer int literal is an in", () => {
            expectKind('1', TypeKind.Int)
        })
        it("should infer null to be null", () => {
            expectKind(`null`, TypeKind.Null)
        })
    })
    describe("lambda", () => {
        it("should a lambda type", () => {
            et(`/().1`).toEqual(lam([], intType))
        })
        it("should infer identity", () => {
            tx(`/a.a`).toEqual(`('a)->'a`)
        })
    })
    describe("record", () => {
        it("should infer an empty rec", () => {
            et(`{}`).toEqual(rec())
        })
        it("should infer a simple record", () => {
            et('{a: 1}').toEqual(rec(m('a', intType)))
        })
        it("should infer multiple members", () => {
            et(`{ a: 1, b: 2, c: 3 }`).toEqual(
                rec(
                    m('a', intType),
                    m('b', intType),
                    m('c', intType)
                )
            )
        })
        it("should infer projected members", () => {
            et(`{ a: 1, ...{b: 2, c: 3}}`).toEqual(
                rec(
                    m('a', intType),
                    m('b', intType),
                    m('c', intType)
                )
            )
        })
        it("should ignore used members in projection", () => {
            et(`{ a: 1, ...{a: "test" } }`).toEqual(rec(m("a", intType)))
        })
        it("should ignore used member after projection (ingore projection order)", () => {
            et(`{ ...{a: "test"}, a: 1}`).toEqual(rec(m("a", intType)))
        })
    })
    describe("array", () => {
        it("can infer an array type", () => {
            et('[0]').toEqual(ar(intType))
        })
    })
    describe("let", () => {
        it("should infer type of reference", () => {
            expectKind(`let a = 1 in a`, TypeKind.Int)
        })
    })
    describe("select", () => {
        it("can infer from a select", () => {
            et('{a: 1}.a').toEqual(intType)
        })
    })
    describe("index", () => {
        it("can infer from an index", () => {
            et('[0][0]').toEqual(intType)
        })
    })
    describe("call", () => {
        it("can infer through an identity", () => {
            et(`
                let
                    id = /a.a
                in id(0)
            `).toEqual(intType)
        })
        it("can infer calls independently", () => {
            et(`
                let
                    id = /a.a
                in { a: id(0), b: id("a")}
            `).toEqual(rec(m("a", intType), m("b", stringType)))
        })
    })
    describe("errors", () => {
        it("can detect an undefined variable", () => {
            err("a", "Reference 'a' is not defined")
        })
        it("can detect a recursive type", () => {
            err("let a = a in a", "Expression contains a recursive type reference")
        })
        it("Can detect a duplicate identifier", () => {
            err("let a = 1, a = 2 in a", "Duplicate declaration")
        })
    })
})

function p(text: string): Expression {
    const lexer = new Lexer(text)
    return parse(lexer, "test")
}

function c(text: string): Type {
    const expression = p(text)
    const checkResult = check(expression, importError)
    if (checkResult.errors.length > 0) {
        throw new Error(`Check returns errors:\n ${
            checkResult.errors.map(e => e.message).join("\n ")
        }`)
    }
    return checkResult.type
}

function et(text: string): jasmine.Matchers<Type> {
    return expect(c(text)).withContext(text)
}

function tt(text: string): string {
    return typeToString(c(text))
}

function tx(text: string): jasmine.Matchers<string> {
    return expect(tt(text)).withContext(text)
}

function err(text: string, message: string) {
    const expression = p(text)
    const checkResult = check(expression, importError)
    expect(checkResult.errors.length).toBeGreaterThan(0)
    for (const error of checkResult.errors) {
        if (error.message.indexOf(message) >= 0) return
    }
    expect(checkResult.errors[0].message).toEqual(message)
}

function expectKind(text: string, kind: TypeKind) {
    const type = c(text)
    expect(type.kind).withContext(text).toBe(kind)
}

function lam(parameters: Type[], result: Type): Type {
    return {
        kind: TypeKind.Lambda,
        parameters,
        result
    }
}

function m(name: string, type: Type): RecordTypeMember {
    return { name, type }
}

function rec(...members: RecordTypeMember[]): RecordType {
    return { kind: TypeKind.Record, members }
}

function ar(element: Type): ArrayType {
    return { kind: TypeKind.Array, element }
}

const intType: IntType = { kind: TypeKind.Int }
const stringType: StringType = { kind: TypeKind.String }

function importError(name: string): Type {
    return {
        kind: TypeKind.Error,
        messages: [{
            start: 0,
            message: 'Import not supported here'
        }]
    }
}
