import { Expression } from "./ast"
import { evaluate } from "./eval"
import { evx } from "./eval.spec"
import { Lexer } from "./lexer"
import { parse } from "./parser"

describe("integration tests", () => {
    it("can evaluate a simple expression", () => {
        ex("1", "1")
    })
    it("can evaluate a match", () => {
        ex("match [1, 2, 3] { [_, ...t] in t }", "[2, 3]")
    })
    it("can match as a switch", () => {
        ex(`match 1 { 1 in "one", 2 in "two", _ in "other" }`, `"one"`)
    })
    it("can destruction a record into an array", () => {
        ex(`
            match { x: 1, y: 2, z: 3 } {
                { x, y, z } in [z, y, x]
            }
        `, `[3, 2, 1]`)
    })
    it("can extract a member using match", () => {
        ex(`
            match { x: 1, y: 2, z: 3 } {
                { x, ...rest } in rest
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
})

function ex(text: string, result: string) {
    const exp = p(text)
    const r = evaluate(p(result))
    evx(exp, r)
}

function p(text: string): Expression {
    const lexer = new Lexer(text)
    const result = parse(lexer, "test")
    return result
}
