import { Expression, NodeKind } from "./ast"
import { evaluate } from "./eval"
import { evbx, simpleImports } from "./eval.spec"
import { fileSet } from "./files"
import { Lexer } from "./lexer"
import { parse } from "./parser"
import { valueToString } from "./value-string"

describe("integration tests", () => {
    it("can evaluate a simple expression", () => {
        ex("1", "1")
    })
    it("can evaluate a match", () => {
        ex("match [1, 2, 3] { [#_, ...#t] in t }", "[2, 3]")
    })
    it("can match as a switch", () => {
        ex(`match 1 { 1 in "one", 2 in "two", #_ in "other" }`, `"one"`)
    })
    it("can destruction a record into an array", () => {
        ex(`
            match { x: 1, y: 2, z: 3 } {
                { #x, #y, #z } in [z, y, x]
            }
        `, `[3, 2, 1]`)
    })
    it("can extract a member using match", () => {
        ex(`
            match { x: 1, y: 2, z: 3 } {
                { #x, ...#rest } in rest
            }
        `, `{ y: 2, z: 3 }`)
    })
    it("can use an expression for a pattern", () => {
        ex(`
            let
              Enum = {
                A: 1,
                B: 2,
              },
              v = match 1 {
                 Enum.A in Enum.B,
                 Enum.B in Enum.A
              }
            in v
        `, `2`)
    })
    it("can evaluate if function", () => {
        ex(`
            let
                if = /(cond, then, else).match cond {
                    true in then(),
                    false in else()
                },
                eq = /(a, b).match a {
                    b in true,
                    #_ in false
                },
                t = /(x).if(eq(x, 10), /().10, /().20),
            in [t(10), t(1)]
        `,
        `[10, 20]`)
    })
    it("empty array only matches empty array", () => {
        ex(`
            match [1, 2, 3] {
                [] in [],
                [1, 2, 3] in "Passed"
            }
        `, `"Passed"`)
    })
    it("can match an projection of empty", () => {
        ex(`
            match [42] {
                [#x, ...#t] in [x, [...t]]
            }
        `, `[42, []]`)
    })
    it("can match a function", () => {
        ex(`
            let
                A = /v.{ A, v }
            in match A(42) {
                { A, #v } in v
            }
        `, `42`)
    })
    describe("imports", () => {
        it("can add", () => {
            ex(`let iadd = import "int.add" in iadd(21, 21)`, `42`)
        })
        it("can substract", () => {
            ex(`let isub = import "int.sub" in isub(52, 10)`, `42`)
        })
        describe("strings", () => {
            it("can concatenate strings", () => {
                ex(`let concat = import "string.concat" in concat("a", "b", "c")`, `"abc"`)
            })
            it("can substr a string", () => {
                ex(`let substr = import "string.sub" in substr("abc", 1)`, `"bc"`)
            })
        })
    })
    describe("tail calls", () => {
        it("can evaluate a deep recursive statement", () => {
            ex(`
                let
                    isub = import "int.sub",
                    rec = /x.match x {
                        0 in 42,
                        #_ in rec(isub(x, 1))
                    }
                in rec(10000)

            `, `42`)
        })
    })
    describe("quote and splice", () => {
        it("can splice a quote", () => {
            ex(`
                $'42
            `, `42`)
        })
        it("can splice a reference to a quote", () => {
            ex(`
                let
                    x = '42
                in
                    $x
            `, `42`)
        })
        it("can splice an array", () => {
            ex(`
                let
                    x = '10,
                    y = '20
                in [$x, $y]
            `,`[10 20]`)
        })
        it("can quote a call", () => {
            ex(`
                let
                    eq = /(a,b).match a {
                        (b) in true,
                        #_ in false
                    },
                    a = 1,
                    b = 1
                in
                    $'eq(a,b)
            `,`true`)
        })
        it("can pass quotes to a function", () => {
            ex(`
                let
                    eq = /(a,b).match a {
                        b in true,
                        #_ in false
                    },
                    if = /(cond, then, else).'(
                        match $cond {
                            true in $then,
                            #_ in $else
                        }
                    )
                in $(if('true, '42, '43))
            `,`42`)
        })
        describe("syntax matching", () => {
            it("can match a literal", () => {
                ex(`
                    match 'true {
                        'true in 42
                        'false in 43
                    }
                `, `42`)

            })
        })
    })
    describe("errors", () => {
        it("reports an invalid projection", () => {
            ee(`...1`, "Cannot project in this context")
        })
        it("reports incorrect number of arguments", () => {
            ee(`
                let
                    a = /(x).x
                in a()
            `, 'Incorrect number of arguments, expected 1, received 0')
        })
        it("reports an invalid call", () => {
            ee("1(2)", "Value cannot be called")
        })
        it("reports invalid us of index", () => {
            ee("1[2]", "Value cannot be indexed")
        })
        it("reports member not found", () => {
            ee("{ a: 1 }.b", 'Member "b" not found')
        })
        it("reports a splice error", () => {
            ee("$1", "Can only splice a quote: 1")
        })
        it("reports a missing match", () => {
            ee("match 1 { 0 in 1 }", "Match not found for 1")
        })
        it("reports a splice error in a quote", () => {
            ee("$'($1)", "Can only splice a quote: 1")
        })
        it("reports invalid array", () => {
            ee("[...1]", "Expected an array: 1")
        })
        it("reports invalid record", () => {
            ee("{...1}", "Expected a record: 1")
        })
        it("reports invalid index", () => {
            ee('[1, 2]["a"]', "Expected an integer")
        })
        it("reports index out of bound", () => {
            ee('[1][2]', "Index out of bound, 2 in 0..1")
        })
        it("reports a import not found", () => {
            ee('import "z"', 'Could not import "z"')
        })
        it("can dump a stack trace", () => {
            const result = es(`
                let
                    sub = import "int.sub",
                    t = /x.match x {
                        0 in 0[0],
                        #_ in t(sub(x, 1))
                    }
                in t(10)
            `)
            expect(result).toEqual('Error <test>:5:30: Value cannot be indexed\n  <test>:6:31')
        })
    })
})

function ex(text: string, result: string) {
    const exp = p(text)
    const r = evaluate(p(result), simpleImports)
    evbx(exp, r)
}

function p(text: string): Expression {
    const lexer = new Lexer(text)
    const result = parse(lexer, "test")
    return result
}

function ee(text: string, message: string) {
    const r = evaluate(p(text), simpleImports)
    expect(r.kind).toBe(NodeKind.Error)
    if (r.kind == NodeKind.Error) {
        expect(r.message).toBe(message)
    }
}

function es(text: string, fileName: string = '<test>'): string {
    const set = fileSet()
    const file = set.declare(fileName, text.length)
    const lexer = new Lexer(text, file)
    const expression = parse(lexer, fileName)
    file.build()
    const value = evaluate(expression, simpleImports)
    expect(value.kind).toBe(NodeKind.Error)
    return valueToString(value, set)
}