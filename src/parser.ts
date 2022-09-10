import { Array, Binding, Expression, Import, Lambda, Let, LiteralBoolean, LiteralFloat, LiteralInt, LiteralKind, LiteralNull, LiteralString, Match, MatchClause, Member, NodeKind, Projection, Quote, Record, Reference, Splice, Variable } from "./ast";
import { Lexer } from "./lexer";
import { Token } from "./token";

export function parse(lexer: Lexer, name: string = "<text>"): Expression {
    let token = lexer.next()
    let result = expression()
    expect(Token.EOF)
    return result

    function postfix(left: Expression): Expression {
        while (postfixExprPrefix[token]) {
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
                        start: left.start,
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
                        start: left.start,
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
                        start: left.start,
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

    function expression(): Expression {
        let left = primary()
        return postfixExprPrefix[token] ? postfix(left) : left
    }

    function referenceOrImport(): Reference | Import {
        const start = lexer.position
        const name = expectName()
        if (name == "import" && token == Token.String) {
            const name: string = lexer.value
            next()
            return {
                kind: NodeKind.Import,
                start,
                name
            }
        }
        return {
            kind: NodeKind.Reference,
            start,
            name
        }
    }

    function int(): LiteralInt {
        const start = lexer.position
        const value: number = expect(Token.Integer)
        return {
            kind: NodeKind.Literal,
            start,
            literal: LiteralKind.Int,
            value
        }
    }

    function float(): LiteralFloat {
        const start = lexer.position
        const value = expect(Token.Float)
        return {
            kind: NodeKind.Literal,
            start,
            literal: LiteralKind.Float,
            value
        }
    }

    function str(): LiteralString {
        const start = lexer.position
        const value: string = expect(Token.String)
        return {
            kind: NodeKind.Literal,
            start,
            literal: LiteralKind.String,
            value
        }
    }

    function nul(): LiteralNull {
        const start = lexer.position
        expect(Token.Null)
        return {
            kind: NodeKind.Literal,
            start,
            literal: LiteralKind.Null,
            value: null
        }
    }

    function tru(): LiteralBoolean {
        const start = lexer.position
        expect(Token.True)
        return {
            kind: NodeKind.Literal,
            start,
            literal: LiteralKind.Boolean,
            value: true
        }
    }

    function fals(): LiteralBoolean {
        const start = lexer.position
        expect(Token.False)
        return {
            kind: NodeKind.Literal,
            start,
            literal: LiteralKind.Boolean,
            value: false
        }
    }

    function lambda(): Lambda {
        const start = lexer.position
        expect(Token.Lambda)
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
            start,
            parameters,
            body
        }
    }

    function lt(): Let {
        const start = lexer.position
        expect(Token.Let)
        const bindings: Binding[] = []
        while (token as any == Token.Identifier) {
            const start = lexer.position
            const name = expectName()
            expect(Token.Equal)
            const value = expression()
            bindings.push({
                kind: NodeKind.Binding,
                start,
                name,
                value
            })
            if (token as Token == Token.Comma) {
                next()
            }
        }
        expect(Token.In)
        const body = expression()
        return {
            kind: NodeKind.Let,
            start,
            bindings,
            body
        }
    }

    function rec(): Record {
        const start = lexer.position
        expect(Token.LBrace)
        const members: (Member | Projection)[] = []
        while (arrayValuePrefix[token]) {
            members.push(member())
            if (token as Token == Token.Comma) next()
        }
        expect(Token.RBrace)
        return {
            kind: NodeKind.Record,
            start,
            members
        }
    }

    function vr(): Variable {
        const start = lexer.position
        expect(Token.Hash)
        const name = expectName()
        return {
            kind: NodeKind.Variable,
            start,
            name
        }
    }

    function project(): Projection {
        const start = lexer.position
        expect(Token.Project)
        const value = expression()
        return {
            kind: NodeKind.Projection,
            start,
            value
        }
    }

    function member(): Member | Projection {
        const start = lexer.position
        function mem(name: string, value: Expression): Member {
            return {
                kind: NodeKind.Member,
                start,
                name,
                value
            }
        }

        switch (token) {
            case Token.Project: {
                next()
                const value = expression()
                return {
                    kind: NodeKind.Projection,
                    start,
                    value
                }
            }
            case Token.Hash: {
                next()
                const start = lexer.position
                const name = expectName()
                const value: Variable = {
                    kind: NodeKind.Variable,
                    start,
                    name
                }
                return mem(name, value)
            }
            default: {        
                const start = lexer.position
                const name = expectName()
                if (token as any == Token.Colon) {
                    next()
                    return mem(name, expression())
                } else {
                    const value: Reference = {
                        kind: NodeKind.Reference,
                        start,
                        name
                    }
                    return mem(name, value)
                }
            }
        }
    }

    function arr(): Array {
        const start = lexer.position
        expect(Token.LBrack)
        const values: (Expression | Projection)[] = []
        while (arrayValuePrefix[token]) {
            values.push(expression())
            if (token == Token.Comma) next()
        }
        expect(Token.RBrack)
        return {
            kind: NodeKind.Array,
            start,
            values
        }
    }

    function match(): Match {
        const start = lexer.position
        expect(Token.Match)
        const target = expression()
        expect(Token.LBrace)
        const clauses: MatchClause[] = []
        while (expressionPrefix[token]) {
            const start = lexer.position
            const pattern = expression()
            expect(Token.In)
            const value = expression()
            clauses.push({
                kind: NodeKind.MatchClause,
                start,
                pattern,
                value
            })
            if (token as Token == Token.Comma) next()
        }
        expect(Token.RBrace)
        return {
            kind: NodeKind.Match,
            start,
            target,
            clauses
        }
    }

    function quote(): Quote {
        const start = lexer.position
        expect(Token.Quote)
        const target = primary()
        return {
            kind: NodeKind.Quote,
            start,
            target
        }
    }

    function splice(): Splice {
        const start = lexer.position
        expect(Token.Dollar)
        const target = primary()
        return {
            kind: NodeKind.Splice,
            start,
            target
        }
    }

    function primary(): Expression {
        switch (token) {
            case Token.Identifier: return referenceOrImport()
            case Token.Integer: return int()
            case Token.Float: return float()
            case Token.String:  return str()
            case Token.Null: return nul()
            case Token.False: return fals()
            case Token.True: return tru()
            case Token.Lambda: return lambda()
            case Token.Let: return lt()
            case Token.Quote: return quote()
            case Token.Dollar: return splice()
            case Token.Match: return match()
            case Token.LBrack: return arr()
            case Token.LBrace: return rec()
            case Token.Hash: return vr()
            case Token.Project: return project()
            case Token.LParen: {
                next()
                const result = expression()
                expect(Token.RParen)
                return result
            }
            default: error(`Expected an expression, received ${tokenString(token)}`)
        }
    }

    function variable(): Variable {
        const start = lexer.position
        const name = expectName()
        return {
            kind: NodeKind.Variable,
            start,
            name
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
        const err = new Error(msg);
        (err as any).line = lexer.line
        throw err
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
        case Token.Dollar: return "Dollar"
        case Token.Quote: return "Quote"
        case Token.Hash: return "Hash"
        case Token.False: return "false"
        case Token.In: return "in"
        case Token.Let: return "let"
        case Token.Match: return "match"
        case Token.Null: return "null"
        case Token.True: return "true"
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
    Token.True, Token.False, Token.Null, Token.Lambda, Token.Let, Token.Match, Token.LParen,
    Token.LBrack, Token.LBrace, Token.Dollar, Token.Quote, Token.Project, Token.Hash)

const memberPrefix = setOf(Token.Hash, Token.Identifier, Token.Project)
const arrayValuePrefix = setOr(expressionPrefix, memberPrefix)
const postfixExprPrefix = setOf(Token.Dot, Token.LBrack, Token.LParen)