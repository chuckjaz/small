import { Expression } from "./ast"
import { evaluate } from "./eval"
import { evbx, simpleImports } from "./eval.spec"
import { Lexer } from "./lexer"
import { parse } from "./parser"

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
