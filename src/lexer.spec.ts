import { Lexer } from "./lexer"
import { Token } from "./token"

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
    it("can scan a project", () => {
        l("...", Token.Project)
    })
    it("can scan a let", () => {
        l("let", Token.Let)
    })
    it("can scan a in", () => {
        l("in", Token.In)
    })
    it("can scan null", () => {
        l("null", Token.Null)
    })
    it("can scan adjacent tokens", () => {
        l("abc(){}[].,:=/1.0", Token.Identifier, Token.LParen, Token.RParen, Token.LBrace,
            Token.RBrace, Token.LBrack, Token.RBrack, Token.Dot, Token.Comma, Token.Colon, 
            Token.Equal, Token.Lambda, Token.Float)
    })
})

function l(text: string, ...tokens: Token[]) {
    const lexer = new Lexer(text)
    for (const token of tokens) {
        expect(lexer.next()).toEqual(token)
    }
    expect(lexer.next()).toEqual(Token.EOF)
}