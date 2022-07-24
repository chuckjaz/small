import { Array, Binding, Expression, Lambda, Let, LiteralFloat, LiteralInt, LiteralKind, LiteralNull, LiteralString, Match, MatchClause, Member, NodeKind, NodeLike, Pattern, Projection, Record, Reference, Variable } from "./ast";
import { Lexer } from "./lexer";
import { Token } from "./token";

export function parse(lexer: Lexer, name: string = "<text>"): Expression {
    let token = lexer.next()
    let result = expression()
    expect(Token.EOF)
    return result

    function expression(): Expression {
        let left = primary()
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

    function reference(): Reference {
        const name = expectName()
        return {
            kind: NodeKind.Reference,
            name
        }
    }

    function int(): LiteralInt {
        const value: number = expect(Token.Integer)
        return {
            kind: NodeKind.Literal,
            literal: LiteralKind.Int,
            value
        }
    }

    function float(): LiteralFloat {
        const value = expect(Token.Float)
        return {
            kind: NodeKind.Literal,
            literal: LiteralKind.Float,
            value
        }
    }

    function str(): LiteralString {
        const value: string = expect(Token.String)
        return {
            kind: NodeKind.Literal,
            literal: LiteralKind.String,
            value
        }
    }

    function nul(): LiteralNull {
        expect(Token.Null)
        return {
            kind: NodeKind.Literal,
            literal: LiteralKind.Null,
            value: null
        }
    }

    function lambda(): Lambda {
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
            parameters,
            body
        }
    }

    function lt(): Let {
        expect(Token.Let)
        const bindings: Binding[] = []
        while (true) {
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

    function rec<T extends NodeLike, P extends NodeLike>(
        el: () => T,
        p: () => P, 
        defKind: NodeKind.Variable | NodeKind.Reference
    ): Record<Member<T> | Projection<P>> {
        expect(Token.LBrace)
        const members: (Member<T> | Projection<P>)[] = []
        while (arrayValuePrefix[token]) {
            members.push(member<T, P>(el, p, defKind))
            if (token as Token == Token.Comma) next()
        }
        expect(Token.RBrace)
        return {
            kind: NodeKind.Record,
            members
        }
    }

    function member<T extends NodeLike, P extends NodeLike>(
        el: () => T,
        p: () => P,
        defKind: NodeKind.Reference | NodeKind.Variable
    ): Member<T> | Projection<P> {
        if (token == Token.Project) {
            next()
            const value = p()
            return {
                kind: NodeKind.Projection,
                value
            }
        } else {
            const name = expectName()
            if (token == Token.Colon) {
                next()
                const value = el()
                return {
                    kind: NodeKind.Member,
                    name,
                    value
                }
            } else {
                return {
                    kind: NodeKind.Member,
                    name,
                    value: {
                        kind: defKind,
                        name
                    } as any
                }
            }
        }
    }

    function element<T extends NodeLike, P extends NodeLike>(
        el: () => T,
        p: () => P
    ): T | Projection<P> {
        if (token == Token.Project) {
            next()
            const value = p()
            return {
                kind: NodeKind.Projection,
                value
            }
        } else {
            return el()
        }
    }

    function arr<T extends NodeLike, P extends NodeLike>(
        el: () => T,
        p: () => P
    ): Array<T | Projection<P>> {
        expect(Token.LBrack)
        const values: (T | Projection<P>)[] = []
        while (arrayValuePrefix[token]) {
            values.push(element(el, p))
            if (token == Token.Comma) next()
        }
        expect(Token.RBrack)
        return {
            kind: NodeKind.Array,
            values
        }
    }

    function match(): Match {
        expect(Token.Match)
        const target = expression()
        expect(Token.LBrace)
        const clauses: MatchClause[] = []
        while (expressionPrefix[token]) {
            const pattern = matchPattern()
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

    function primary(): Expression {
        switch (token) {
            case Token.Identifier: return reference()
            case Token.Integer: return int()
            case Token.Float: return float()
            case Token.String:  return str()
            case Token.Null: return nul()
            case Token.Lambda: return lambda()
            case Token.Let: return lt()
            case Token.Match: return match()
            case Token.LBrack: return arr(expression, expression)
            case Token.LBrace: return rec(expression, expression, NodeKind.Reference)
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
        const name = expectName()
        return {
            kind: NodeKind.Variable,
            name
        }
    }

    function matchVariableOrPattern(): Pattern | Variable {
        switch (token) {
            case Token.Identifier: return variable()
            case Token.LBrace: return matchPatternRecord()
            case Token.LBrack: return matchPatternArray()
            default: error("Expected an identifier")
        }
    }

    function matchPattern(): Expression | Pattern | Variable {
        switch(token) {
            case Token.Identifier:
            case Token.LBrack:
            case Token.LBrace:
                return matchVariableOrPattern()
            default:
                return expression()
        }
    }

    function matchPatternRecord(): Pattern {
        return {
            kind: NodeKind.Pattern,
            pattern: rec(matchPattern, matchVariableOrPattern, NodeKind.Variable)
        }
    }

    function matchPatternArray(): Pattern {
        return {
            kind: NodeKind.Pattern,
            pattern: arr(matchPattern, matchVariableOrPattern)
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
const postfixExprPrefix = setOf(Token.Dot, Token.LBrack, Token.LParen)