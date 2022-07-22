import { Binding, Expression, LiteralKind, MatchClause, Member, NodeKind, Projection } from "./ast";
import { Lexer } from "./lexer";
import { Token } from "./token";

export function parse(lexer: Lexer, name: string = "<text>"): Expression {
    let token = lexer.next()
    let result = expression()
    expect(Token.EOF)
    return result

    function expression(): Expression {
        let left = primary()
        while (true) {
            switch (token) {
                case Token.LParen: {
                    next()
                    const args: Expression[] = []
                    while (expressionPrefix[token]) {
                        args.push(expression())
                        if (token as Token == Token.Comma) next()
                    }
                    expect(Token.RParen)
                    left = {
                        kind: NodeKind.Call,
                        target: left,
                        args
                    }
                    continue
                }
                case Token.Dot: {
                    next()
                    const name = expectName()
                    left = {
                        kind: NodeKind.Select,
                        target: left,
                        name
                    }
                    continue
                }
                case Token.LBrack: {
                    next()
                    const index = expression()
                    expect(Token.RBrack)
                    left = {
                        kind: NodeKind.Index,
                        target: left,
                        index
                    }
                    continue
                }
            }
            break
        }
        return left
    }

    function primary(): Expression {
        switch (token) {
            case Token.Identifier: {
                const name = expectName()
                return {
                    kind: NodeKind.Reference,
                    name
                }
            }
            case Token.Integer: {
                const value: number = expect(Token.Integer)
                return {
                    kind: NodeKind.Literal,
                    literal: LiteralKind.Int,
                    value
                }
            }
            case Token.Float: {
                const value: number = expect(Token.Float)
                return {
                    kind: NodeKind.Literal,
                    literal: LiteralKind.Float,
                    value
                }
            }
            case Token.String: {
                const value: string = expect(Token.String)
                return {
                    kind: NodeKind.Literal,
                    literal: LiteralKind.String,
                    value
                }
            }
            case Token.Null: {
                next()
                return {
                    kind: NodeKind.Literal,
                    literal: LiteralKind.Null,
                    value: null
                }
            }
            case Token.Lambda: {
                next()
                const parameters: string[] = []
                switch (token as Token) {
                    case Token.Identifier: {
                        parameters.push(expectName())
                        break
                    }
                    case Token.LParen: {
                        next()
                        while (token as Token == Token.Identifier) {
                            parameters.push(expectName())
                            if (token as Token == Token.Comma) next()
                        }
                        expect(Token.RParen)
                        break
                    }
                    default: expectName()
                }
                expect(Token.Dot)
                const body = expression()
                return {
                    kind: NodeKind.Lambda,
                    parameters,
                    body
                }
            }
            case Token.Let: {
                next()
                const bindings: Binding[] = []
                while (token as Token == Token.Identifier) {
                    const name = expectName()
                    expect(Token.Equal)
                    const value = expression()
                    bindings.push({
                        kind: NodeKind.Binding,
                        name,
                        value
                    })
                    if (token as Token == Token.Comma) {
                        next()
                        continue
                    }
                    break
                }
                expect(Token.In)
                const body = expression()
                return {
                    kind: NodeKind.Let,
                    bindings,
                    body
                }
            }
            case Token.Match: {
                next()
                const target = expression()
                expect(Token.LBrace)
                const clauses: MatchClause[] = []
                while (expressionPrefix[token]) {
                    const pattern = expression()
                    expect(Token.In)
                    const value = expression()
                    clauses.push({
                        kind: NodeKind.MatchClause,
                        pattern,
                        value
                    })
                    if (token as Token == Token.Comma) next()
                }
                expect(Token.RBrace)
                return {
                    kind: NodeKind.Match,
                    target,
                    clauses
                }
            }
            case Token.LBrack: {
                const values: (Expression | Projection)[] = []
                next()
                while (arrayValuePrefix[token]) {
                    if (token as Token == Token.Project) {
                        next()
                        const value = expression()
                        values.push({
                            kind: NodeKind.Projection,
                            value
                        })
                    } else {
                        values.push(expression())
                    }
                    if (token as Token == Token.Comma) next()
                }
                expect(Token.RBrack)
                return {
                    kind: NodeKind.Array,
                    values
                }
            }
            case Token.LBrace: {
                const members: (Member | Projection)[] = []
                next()
                while (memberPrefix[token]) {
                    if (token as Token == Token.Identifier) {
                        const name = expectName()
                        if (token as Token == Token.Colon) {
                            next()
                            const value = expression()
                            members.push({
                                kind: NodeKind.Member,
                                name,
                                value
                            })
                        } else {
                            members.push({
                                kind: NodeKind.Member,
                                name,
                                value: {
                                    kind: NodeKind.Reference,
                                    name
                                }
                            })
                        }
                    }
                    else {
                        expect(Token.Project)
                        const value = expression()
                        members.push({
                            kind: NodeKind.Projection,
                            value
                        })
                    }
                    if (token as Token == Token.Comma) next()
                }
                expect(Token.RBrace)
                return {
                    kind: NodeKind.Record,
                    members
                }
            }
            case Token.LParen: {
                next()
                const result = expression()
                expect(Token.RParen)
                return result
            }
            default: error(`Expected an expression, received ${tokenString(token)}`)
        }
    }

    function next(): Token {
        token = lexer.next()
        return token
    }

    function expect(tok: Token): any {
        const result = lexer.value
        if (token != tok) error(`Expected ${tokenString(tok)}, received ${tokenString(token)}`)
        next()
        return result
    }

    function expectName(): string {
        return expect(Token.Identifier) as string
    }

    function error(message: string): never {
        const msg = `Error ${name}:${lexer.line}:${lexer.start - lexer.lineStart + 1}: ${message}`
        throw new Error(msg)
    }
}

function tokenString(token: Token): string {
    switch (token) {
        case Token.Identifier: return "Identifier"
        case Token.Integer: return "Integer"
        case Token.Float: return "Float"
        case Token.String: return "String"        
        case Token.Lambda: return "Lambda"
        case Token.Dot: return "Dot"
        case Token.Comma: return "Comma"
        case Token.Colon: return "Colon"
        case Token.Equal: return "Equal"
        case Token.Project: return "Project"
        case Token.LParen: return "LParen"
        case Token.RParen: return "RParen"
        case Token.LBrack: return "LBrack"
        case Token.RBrack: return "RBrack"
        case Token.LBrace: return "LBrace"
        case Token.RBrace: return "RBrace"
        case Token.In: return "in"
        case Token.Let: return "let"
        case Token.Match: return "match"
        case Token.Null: return "null"
        case Token.EOF: return "EOF"
        case Token.Error: return "Error"
    }    
}

function setOf(...tokens: Token[]): boolean[] {
    const result: boolean[] = []
    for (const token of tokens) result[token] = true
    return result
}

function setOr(...sets: boolean[][]): boolean[] {
    const result: boolean[] = []
    sets.forEach(s => s.forEach((v, i) => result[i] = v))
    return result
}

const expressionPrefix = setOf(Token.Identifier, Token.Integer, Token.Float, Token.String,
    Token.Lambda, Token.Let, Token.Match, Token.LParen, Token.LBrack, Token.LBrace)

const memberPrefix = setOf(Token.Identifier, Token.Project)
const arrayValuePrefix = setOr(expressionPrefix, memberPrefix)