import { Lexer } from "./lexer"
import { Token } from "./token"

import * as fs from 'fs'
import { FileSet, fileSet } from "./files"

describe("lexer", () => {
    it("can scan an identifier", () => {
        l("abcd", Token.Identifier)
    })
    it("can scan an integer", () => {
        l("1", Token.Integer)
    })
    it("can scan a float", () => {
        l("1.0", Token.Float)
    })
    it("can scan a string", () => {
        l('"abcd"', Token.String)
    })
    it("can scan a lambda", () => {
        l("/", Token.Lambda)
    })
    it("can scan a dot", () => {
        l(".", Token.Dot)
    })
    it("can scan a lparen", () => {
        l("(", Token.LParen)
    })
    it("can scan a rparen", () => {
        l(")", Token.RParen)
    })
    it("can scan a lbracket", () => {
        l("[", Token.LBrack)
    })
    it("can scan a rbracket", () => {
        l("]", Token.RBrack)
    })
    it("can scan lbrace", () => {
        l("{", Token.LBrace)
    })
    it("can scan rbrace", () => {
        l("}", Token.RBrace)
    })
    it("can scan a comma", () => {
        l(",", Token.Comma)
    })
    it("can scan a colon", () => {
        l(":", Token.Colon)
    })
    it("can scan a equal", () => {
        l("=", Token.Equal)
    })
    it("can scan a dollar", () => {
        l("$", Token.Dollar)
    })
    it("can scan a quote", () => {
        l("'", Token.Quote)
    })
    it("can scan a project", () => {
        l("...", Token.Project)
    })
    it("can scan a hash", () => {
        l("#", Token.Hash)
    })
    it("can scan a in", () => {
        l("in", Token.In)
    })
    it("can scan a let", () => {
        l("let", Token.Let)
    })
    it("can scan match", () => {
        l("match", Token.Match)
    })
    it("can scan null", () => {
        l("null", Token.Null)
    })
    it("can scan true", () => {
        l("true", Token.True)
    })
    it("can scan false", () => {
        l("false", Token.False)
    })
    it("can scan adjacent tokens", () => {
        l("abc(){}[].,:=/$'#1.0", Token.Identifier, Token.LParen, Token.RParen, Token.LBrace,
            Token.RBrace, Token.LBrack, Token.RBrack, Token.Dot, Token.Comma, Token.Colon,
            Token.Equal, Token.Lambda, Token.Dollar, Token.Quote, Token.Hash, Token.Float)
    })
    it("can scan smaller.sm", () => {
        const [tokens] = lf("examples/smaller.sm")
        expect(tokens.length).toBeGreaterThan(0)
    })
    describe("strings", () => {
        function s(text: string): string {
            const lexer = new Lexer(text)
            expect(lexer.next()).toBe(Token.String)
            return lexer.value
        }
        const b = '\\'
        const q = '\"'
        it("can parse a quote", () => {
            expect(s(`"${b}""`)).toBe('"')
        })
        it("can parse quotes at start and end", () => {
            expect(s(`"${b}"value${b}""`)).toBe('"value"')
        })
        it("can parse quote in the middle", () => {
            expect(s(`"front${b}"end"`)).toBe('front"end')
        })
        it("can parse multi-quotes", () => {
            expect(s(` "${b}"" `)).toBe('"')
        })
        it("can parse backslash", () => {
            expect(s(` "${b}${b}" `)).toBe('\\')
        })
        it("can parse multiple quotes", () => {
            l(` "${b}"", value, "${b}""`, Token.String, Token.Comma, Token.Identifier, Token.Comma,
                Token.String)
        })
    })
})

function l(text: string, ...tokens: Token[]) {
    const lexer = new Lexer(text)
    for (const token of tokens) {
        expect(lexer.next()).toEqual(token)
    }
    expect(lexer.next()).toEqual(Token.EOF)
}

function lf(fileName: string): [Token[], number[], FileSet] {
    const text = fs.readFileSync(fileName, 'utf-8')
    const set = fileSet()
    const fileBuilder = set.declare(fileName, text.length)
    const lexer = new Lexer(text, fileBuilder)
    const tokens: Token[] = []
    const positions: number[] = []
    for (let token = lexer.next(); token != Token.EOF; token = lexer.next()) {
        positions.push(lexer.position)
        tokens.push(token)
    }
    fileBuilder.build()

    const lines = text.split('\n')
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        const pos = positions[i]
        const position = set.position({ start: pos })
        if (position == null) throw new Error("Expected a position to be valid")
        const c = lines[position.line - 1][position.column - 1]
        switch (token) {
            case Token.Colon: expect(c).toBe(':'); break
            case Token.Comma: expect(c).toBe(','); break
            case Token.Dollar: expect(c).toBe('$'); break
            case Token.Dot: expect(c).toBe('.'); break
            case Token.Equal: expect(c).toBe('='); break
            case Token.False: expect(c).toBe('f'); break
            case Token.Hash: expect(c).toBe('#'); break
            case Token.Identifier: expect(isIdentStart(c)).toBeTrue(); break
            case Token.In: expect(c).toBe('i'); break
            case Token.Integer: expect(isNumberStart(c)).toBeTrue(); break
            case Token.LBrace: expect(c).toBe('{'); break
            case Token.LBrack: expect(c).toBe('['); break
            case Token.LParen: expect(c).toBe('('); break
            case Token.Lambda: expect(c).toBe('/'); break
            case Token.Let: expect(c).toBe('l'); break
            case Token.Match: expect(c).toBe('m'); break
            case Token.Null: expect(c).toBe('n'); break
            case Token.Project: expect(c).toBe('.'); break
            case Token.Quote: expect(c).toBe("'"); break
            case Token.RBrace: expect(c).toBe('}'); break
            case Token.RBrack: expect(c).toBe(']'); break
            case Token.RParen: expect(c).toBe(')'); break
            case Token.String: expect(c).toBe('"'); break
            case Token.True: expect(c).toBe('t'); break
            default: throw Error("Unexpected token")
        }
    }
    return [tokens, positions, set]
}

function isIdentStart(c: string): boolean {
    return !!c.match(/[a-z_]/i)
}

function isNumberStart(c: string): boolean {
    return !!c.match(/[0-9]/)
}