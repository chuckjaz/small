import { Array, Expression, Literal, LiteralInt, LiteralKind, Member, NodeKind, Pattern, Projection, Record, Variable } from "./ast";
import { valueToString } from "./value-string";

const enum BoundKind {
    Reference = 100,
    Let,
    Record,
    Lambda,
    Call,
    Select,
    Index,
    Projection,
    Quote,
    Splice,
    Match,
    MatchClause,
    Pattern,
    Variable,
}

interface BoundReference {
    kind: BoundKind.Reference,
    name: string // debugging only
    level: number
    index: number
}

interface BoundLet {
    kind: BoundKind.Let
    bindings: BoundExpression[]
    body: BoundExpression
}

interface BoundLambda {
    kind: BoundKind.Lambda
    arity: number
    body: BoundExpression
}

interface BoundCall {
    kind: BoundKind.Call
    args: BoundExpression[]
    target: BoundExpression
}

interface BoundSelect {
    kind: BoundKind.Select
    target: BoundExpression
    name: string // Debugging only
    symbol: number
}

interface BoundIndex {
    kind: BoundKind.Index
    target: BoundExpression
    index: BoundExpression
}

interface BoundRecord {
    kind: BoundKind.Record
    symbols: number[]
    members: (BoundExpression | BoundProjection)[]
}

interface BoundProjection {
    kind: BoundKind.Projection
    value: BoundExpression
}

interface BoundQuote {
    kind: BoundKind.Quote
    target: BoundExpression
}

interface BoundSplice {
    kind: BoundKind.Splice
    target: BoundExpression
}

interface BoundMatch {
    kind: BoundKind.Match
    target: BoundExpression
    clauses: BoundMatchClause[]
}

interface BoundMatchClause {
    kind: BoundKind.MatchClause
    size: number
    pattern: BoundExpression | BoundPattern | BoundVariable
    value: BoundExpression
}

interface BoundPattern {
    kind: BoundKind.Pattern
    pattern: BoundArrayPattern | BoundRecordPattern
}

interface BoundVariable {
    kind: BoundKind.Variable
    name: string // debugging only
    index: number
}

type BoundArray = Array<BoundExpression | BoundProjection>
type BoundArrayPattern = Array<BoundExpression | BoundPatternProjection | BoundVariable | BoundPattern>

interface BoundPatternProjection {
    kind: BoundKind.Projection,
    value: BoundPattern | BoundVariable
}

interface BoundRecordPattern {
    kind: BoundKind.Record
    members: (BoundPatternMember | BoundPatternProjection)[]
}

interface BoundPatternMember {
    kind: NodeKind.Member,
    name: string // debugging only
    symbol: number
    value: BoundExpression | BoundVariable | BoundPattern
}

export type BoundExpression =
    Literal |
    BoundReference |
    BoundLet |
    BoundLambda |
    BoundCall |
    BoundRecord |
    BoundArray |
    BoundSelect |
    BoundIndex |
    BoundQuote |
    BoundSplice |
    BoundMatch

interface ContextBinding {
    level: number
    index: number
}

interface BindingContext {
    find(name: string): ContextBinding | undefined
    quoteFind(name: string): ContextBinding | undefined
    spliceQuoteContext: boolean
}

const emptyContext: BindingContext = {
    find(name: string) { return undefined },
    quoteFind(name: string) { return undefined },
    spliceQuoteContext: false

}

const symbols = new Map<string, number>()
const symbolNames: string[] = []

export function symbolOf(name: string): number {
    const existing = symbols.get(name)
    if (existing !== undefined) return existing
    const index = symbols.size
    symbolNames[index] = name
    symbols.set(name, index)
    return index
}

export function nameOfSymbol(symbol: number): string {
    return symbolNames[symbol] ?? `<unknown symbol ${symbol}>`
}

function bind(node: Expression): BoundExpression {

    return b(emptyContext, node)

    function b(context: BindingContext, node: Expression): BoundExpression {
        switch (node.kind) {
            case NodeKind.Literal: return node
            case NodeKind.Reference: {
                const location = context.find(node.name)
                const name = node.name
                if (location) {
                    const { level, index } = location
                    return {
                        kind: BoundKind.Reference,
                        name,
                        level,
                        index
                    }
                } else {
                    error(`Undefined "${name}"`)
                }
            }
            case NodeKind.Let: {
                const indexes = new Map<string, number>()
                let index = 0
                for (const binding of node.bindings) {
                    const name = binding.name
                    if (indexes.has(name)) {
                        error(`Duplicate variable name $name`)
                    }
                    indexes.set(name, index++)
                }
                const letContext = contextOf(context, indexes)
                const bindings = node.bindings.map(binding => b(letContext, binding.value))
                const body = b(letContext, node.body)
                return {
                    kind: BoundKind.Let,
                    bindings,
                    body
                }
            }
            case NodeKind.Lambda: {
                const indexes = node.parameters.reduce((map, name, index) => (map.set(name, index), map), new Map<string, number>())
                const lambdaContext = contextOf(context, indexes)
                const body = b(lambdaContext, node.body)
                return {
                    kind: BoundKind.Lambda,
                    arity: indexes.size,
                    body
                }
            }
            case NodeKind.Call: {
                let target = b(context, node.target)
                let args = node.args.map(arg => b(context, arg))
                return {
                    kind: BoundKind.Call,
                    target,
                    args
                }
            }
            case NodeKind.Record: {
                const symbols: number[] = []
                const members: (BoundExpression | BoundProjection)[] = []
                for (const member of node.members) {
                    switch (member.kind) {
                        case NodeKind.Projection: {
                            const value = b(context, member.value)
                            members.push({
                                kind: BoundKind.Projection,
                                value
                            })
                            break
                        }
                        default:
                            symbols[members.length] = symbolOf(member.name)
                            members.push(b(context, member.value))
                            break
                    }
                }
                return {
                    kind: BoundKind.Record,
                    symbols,
                    members
                }
            }
            case NodeKind.Array: {
                const values: (BoundExpression | BoundProjection)[] = []
                for (const value of node.values) {
                    switch (value.kind) {
                        case NodeKind.Projection: {
                            const v = b(context, value.value)
                            values.push({
                                kind: BoundKind.Projection,
                                value: v
                            })
                            break
                        }
                        default:
                            values.push(b(context, value));
                            break
                    }
                }
                return {
                    kind: NodeKind.Array,
                    values
                }
            }
            case NodeKind.Select: {
                const target = b(context, node.target)
                const name = node.name
                const symbol = symbolOf(name)
                return {
                    kind: BoundKind.Select,
                    target,
                    name,
                    symbol
                }
            }
            case NodeKind.Index: {
                const target = b(context, node.target)
                const index = b(context, node.index)
                return {
                    kind: BoundKind.Index,
                    target,
                    index
                }
            }
            case NodeKind.Quote: {
                const quoteContext = swapQuoteSpliceContext(context)
                const target = b(quoteContext, node.target)
                return {
                    kind: BoundKind.Quote,
                    target
                }
            }
            case NodeKind.Splice: {
                const spliceContext = swapQuoteSpliceContext(context)
                const target = b(spliceContext, node.target)
                return {
                    kind: BoundKind.Splice,
                    target
                }
            }
            case NodeKind.Match: {
                const target = b(context, node.target)

                interface BindingScopeBuilder {
                    indexOf(name: string): number
                    size(): number
                    context(): BindingContext
                }

                function scopeBuilder(): BindingScopeBuilder {
                    const indexes = new Map<string, number>()
                    return {
                        indexOf(name: string): number {
                            const last = indexes.get(name)
                            if (last != undefined) return last
                            const index = indexes.size + 1
                            indexes.set(name, index)
                            return index
                        },
                        size(): number { return indexes.size },
                        context() {
                            return contextOf(context, indexes)
                        }
                    }
                }

                function bindArrayPattern(
                    builder: BindingScopeBuilder,
                    a: Array<Expression | Pattern | Variable | Projection<Pattern | Variable>>
                ): BoundPattern {
                    const values: (BoundExpression | BoundPattern | BoundVariable | BoundPatternProjection)[] = []
                    for (const value of a.values) {
                        switch (value.kind) {
                            case NodeKind.Projection: {
                                const v = p(builder, value.value) as BoundPattern | BoundVariable
                                values.push({
                                    kind: BoundKind.Projection,
                                    value: v
                                })
                                break
                            }
                            default: {
                                values.push(p(builder, value))
                                break
                            }
                        }
                    }
                    const boundPat: BoundArrayPattern = {
                        kind: NodeKind.Array,
                        values
                    }
                    return {
                        kind: BoundKind.Pattern,
                        pattern: boundPat
                    }
                }

                function bindRecordPattern(
                    builder: BindingScopeBuilder,
                    r: Record<Member<Expression |  Pattern | Variable> | Projection<Pattern | Variable>>
                ): BoundPattern {
                    const members: (BoundPatternMember | BoundPatternProjection)[] = []
                    for (const member of r.members) {
                        switch (member.kind) {
                            case NodeKind.Projection: {
                                const value = p(builder, member.value) as BoundVariable | BoundPattern
                                members.push({
                                    kind: BoundKind.Projection,
                                    value
                                })
                                break
                            }
                            case NodeKind.Member: {
                                const value = p(builder, member.value)
                                const name = member.name
                                const symbol = symbolOf(name)
                                members.push({
                                    kind: NodeKind.Member,
                                    name,
                                    symbol,
                                    value
                                })
                            }
                        }
                    }
                    const pattern: BoundRecordPattern = {
                        kind: BoundKind.Record,
                        members
                    }
                    return {
                        kind: BoundKind.Pattern,
                        pattern
                    }
                }

                function p(builder: BindingScopeBuilder, pattern: Expression | Pattern | Variable): BoundExpression | BoundPattern | BoundVariable {
                    switch (pattern.kind) {
                        case NodeKind.Variable: {
                            const name = pattern.name
                            const index = builder.indexOf(name)
                            return {
                                kind: BoundKind.Variable,
                                name,
                                index
                            }
                        }
                        case NodeKind.Pattern: {
                            const pat = pattern.pattern
                            switch(pat.kind) {
                                case NodeKind.Array:
                                    return bindArrayPattern(builder, pat)
                                case NodeKind.Record:
                                    return bindRecordPattern(builder, pat)
                            }
                        }
                        default:
                            return b(context, pattern)
                    }
                }

                const clauses = node.clauses.map<BoundMatchClause>(clause => {
                    const builder = scopeBuilder()
                    const pattern = p(builder, clause.pattern)
                    const size = builder.size()
                    const clauseContext = builder.context()
                    const value = b(clauseContext, clause.value)
                    return {
                        kind: BoundKind.MatchClause,
                        pattern,
                        size,
                        value
                    }
                })
                return {
                    kind: BoundKind.Match,
                    target,
                    clauses
                }
            }
        }
    }
}

export type CallContext = Value[][]

export type Value =
    Literal |
    RecordValue |
    ArrayValue |
    QuoteValue |
    LambdaValue

export interface ArrayValue {
    kind: NodeKind.Array
    values: Value[]
}

export interface RecordValue {
    kind: NodeKind.Record
    cls: number[]
    values: Value[]
}

export interface QuoteValue {
    kind: NodeKind.Quote
    context: CallContext
    target: BoundExpression
}

export interface LambdaValue {
    kind: NodeKind.Lambda
    context: CallContext
    arity: number
    body: BoundExpression
}

export function valueEquals(a: Value, b: Value): boolean {
    if (a === b) return true
    if (a.kind != b.kind) return false
    switch (a.kind) {
        case NodeKind.Literal: {
            const bLit = b as Literal
            if (bLit.literal != a.literal) return false
            return a.value == (b as Literal).value
        }
        case NodeKind.Array: {
            const aValues = a.values
            const bValues = (b as ArrayValue).values
            if (aValues.length != bValues.length) return false
            return aValues.every((value, index) => valueEquals(value, bValues[index]))
        }
        case NodeKind.Record: {
            const bRec = b as RecordValue
            const aCls = a.cls
            const bCls = bRec.cls
            if (aCls === bCls) {
                const bValues = bRec.values
                return a.values.every((value, index) => valueEquals(value, bValues[index]))
            } else {
                if (a.values.length != bRec.values.length) return false
                return aCls.every((index, symbol) => {
                    const bIndex = bCls[symbol]
                    if (bIndex == undefined) return false
                    return valueEquals(a.values[index], bRec.values[bIndex])
                })
            }
        }
        case NodeKind.Quote: {
            const aTarget = a.target
            const bTarget = (b as QuoteValue).target
            if (aTarget.kind == NodeKind.Literal && bTarget.kind == NodeKind.Literal)
                return valueEquals(aTarget, bTarget)
        }
    }
    return false
}

function boundEvaluate(expression: BoundExpression): Value {
    return e([], expression)

    function e(context: CallContext, node: BoundExpression): Value {
        switch (node.kind) {
            case NodeKind.Literal: return node
            case BoundKind.Reference: {
                const result = (context[node.level] ?? [])[node.index]
                if (result === undefined)
                    error(`Internal error: unbound value ${node.name}`)
                return result
            }
            case BoundKind.Let: {
                const bindings: Value[] = []
                const letContext = [bindings, ...context]
                for (const binding of node.bindings) {
                    bindings.push(e(letContext, binding))
                }
                return e(letContext, node.body)
            }
            case BoundKind.Call: {
                const target = lambda(e(context, node.target))
                if (target.arity != node.args.length) {
                    error(`Incorrect number of arguments, expected ${target.arity}, received ${node.args.length}`)
                }
                const args = node.args.map(v => e(context, v))
                const callContext = [args, ...target.context]
                return e(callContext, target.body)
            }
            case BoundKind.Index: {
                const target = e(context, node.target)
                const index = int(e(context, node.index))
                switch (target.kind) {
                    case NodeKind.Array:
                        return idx(target.values, index.value)
                    case NodeKind.Literal:
                        if (target.literal == LiteralKind.String) {
                            return idxs(target.value, index.value)
                        }
                        // fall-through
                    default:
                        error("Value cannot be indexed")
                }
            }
            case BoundKind.Select: {
                const target = record(e(context, node.target))
                const symbol = node.symbol
                const index = target.cls[symbol]
                if (index == undefined) {
                    error(`Member "${node.name}" not found`)
                }
                return target.values[index]
            }
            case NodeKind.Array: {
                const values: Value[] = []
                for (const value of node.values) {
                    switch (value.kind) {
                        case BoundKind.Projection: {
                            const a = array(e(context, value.value))
                            values.push(...a.values)
                            break
                        }
                        default:
                            values.push(e(context, value))
                            break
                    }
                }
                return {
                    kind: NodeKind.Array,
                    values
                }
            }
            case BoundKind.Record: {
                const cls: number[] = []
                const values: Value[] = []
                node.members.forEach((member, index) => {
                    switch (member.kind) {
                        case BoundKind.Projection:
                            const r = record(e(context, member.value))
                            const symbols = classToSymbols(r.cls)
                            symbols.forEach((symbol, index) => {
                                if (cls[symbol] == undefined) {
                                    cls[symbol] = values.length
                                    values.push(r.values[index])
                                }
                            })
                            break
                        default:
                            const symbol = node.symbols[index]
                            cls[symbol] = values.length
                            values.push(e(context, member))
                            break
                    }
                })
                return {
                    kind: NodeKind.Record,
                    cls,
                    values
                }
            }
            case BoundKind.Lambda: {
                return {
                    kind: NodeKind.Lambda,
                    context,
                    arity: node.arity,
                    body: node.body
                }
            }
            case BoundKind.Quote: {
                return {
                    kind: NodeKind.Quote,
                    context,
                    target: quote(context, node.target)
                }
            }
            case BoundKind.Splice: {
                const target = e(context, node.target)
                switch (target.kind) {
                    case NodeKind.Quote:
                        return e(target.context, target.target)
                    default:
                        error(`Can only splice a quote: ${valueToString(target)}`)
                }
            }
            case BoundKind.Match: {
                const target = e(context, node.target)
                for (const clause of node.clauses) {
                    const file: Value[] = []
                    if (match(context, clause.pattern, target, file)) {
                        const matchContext = [file, ...context]
                        return e(matchContext, clause.value)
                    }
                }
                error(`Match not found: ${valueToString(target)} for ${boundToString(node)}`)
            }
        }
    }

    function quote(context: CallContext, node: BoundExpression): BoundExpression {
        switch (node.kind) {
            case NodeKind.Literal: return node
            case BoundKind.Reference: return node
            case BoundKind.Let: {
                const bindings = node.bindings.map(b => quote(context, b))
                const body = quote(context, node.body)
                return {
                    kind: BoundKind.Let,
                    bindings,
                    body
                }
            }
            case BoundKind.Lambda: {
                const body = quote(context, node.body)
                return {
                    kind: BoundKind.Lambda,
                    arity: node.arity,
                    body
                }
            }
            case BoundKind.Call: {
                const target = quote(context, node.target)
                const args = node.args.map(a => quote(context, a))
                return {
                    kind: BoundKind.Call,
                    target,
                    args
                }
            }
            case BoundKind.Record: {
                const members = node.members.map(quoteExpressionOrProjection)
                return {
                    kind: BoundKind.Record,
                    symbols: node.symbols,
                    members
                }
            }
            case NodeKind.Array: {
                const values = node.values.map(quoteExpressionOrProjection)
                return {
                    kind: NodeKind.Array,
                    values
                }
            }
            case BoundKind.Select: {
                const target = quote(context, node.target)
                return {
                    kind: BoundKind.Select,
                    target,
                    name: node.name,
                    symbol: node.symbol
                }
            }
            case BoundKind.Index: {
                const target = quote(context, node.target)
                const index = quote(context, node.index)
                return {
                    kind: BoundKind.Index,
                    target,
                    index
                }
            }
            case BoundKind.Quote: return node
            case BoundKind.Splice: {
                const target = e(context, node.target)
                switch (target.kind) {
                    case NodeKind.Quote:
                        // What about the quote's context?
                        return target.target
                    default:
                        error(`Can only splice a quote: ${valueToString(target)}`)
                }
            }
            case BoundKind.Match: {
                const target = quote(context, node.target)
                const clauses = node.clauses.map(quoteClause)
                return {
                    kind: BoundKind.Match,
                    target,
                    clauses
                }
            }
        }

        function quoteExpressionOrProjection(node: BoundExpression | BoundProjection): BoundExpression | BoundProjection {
            switch (node.kind) {
                case BoundKind.Projection:
                    const value = quote(context, node.value)
                    return {
                        kind: BoundKind.Projection,
                        value
                    }
                default: return quote(context, node)
            }
        }

        function quoteClause(node: BoundMatchClause): BoundMatchClause {
            const pattern = quoteExpressionPatternOrVariable(node.pattern)
            const value = quote(context, node.value)
            return {
                kind: BoundKind.MatchClause,
                size: node.size,
                pattern,
                value
            }
        }

        function quotePatternOrVariable(node: BoundPattern | BoundVariable): BoundPattern | BoundVariable {
            switch (node.kind) {
                case BoundKind.Variable: return node
                case BoundKind.Pattern: {
                    const pattern = quoteRecordOrArrayPattern(node.pattern)
                    return {
                        kind: BoundKind.Pattern,
                        pattern
                    }
                }
            }
        }

        function quoteExpressionPatternOrVariable(node: BoundExpression | BoundPattern | BoundVariable): BoundExpression | BoundPattern | BoundVariable {
            switch (node.kind) {
                case BoundKind.Variable:
                case BoundKind.Pattern: return quotePatternOrVariable(node)
                default: return quote(context, node)
            }
        }

        function quoteRecordOrArrayPattern(node: BoundArrayPattern | BoundRecordPattern): BoundArrayPattern | BoundRecordPattern {
            switch (node.kind) {
                case NodeKind.Array: {
                    const values = node.values.map(quoteExpressionPatternProjectionOrVariable)
                    return {
                        kind: NodeKind.Array,
                        values
                    }
                }
                case BoundKind.Record: {
                    const members = node.members.map(quoteMemberOrProjection)
                    return {
                        kind: BoundKind.Record,
                        members
                    }
                }
            }
        }

        function quotePatternProjection(node: BoundPatternProjection): BoundPatternProjection {
            const value = quotePatternOrVariable(node.value)
            return {
                kind: BoundKind.Projection,
                value
            }
        }

        function quoteExpressionPatternProjectionOrVariable(
            node: BoundExpression | BoundPattern | BoundPatternProjection | BoundVariable
        ) : BoundExpression | BoundPattern | BoundPatternProjection | BoundVariable {
            switch (node.kind) {
                case BoundKind.Projection: return quotePatternProjection(node)
                default: return quoteExpressionPatternOrVariable(node)
            }
        }

        function quoteMemberOrProjection(node: BoundPatternMember | BoundPatternProjection): BoundPatternMember | BoundPatternProjection {
            switch (node.kind) {
                case NodeKind.Member: {
                    const value = quoteExpressionPatternOrVariable(node.value)
                    return {
                        kind: NodeKind.Member,
                        name: node.name,
                        symbol: node.symbol,
                        value
                    }
                }
                case BoundKind.Projection: return quotePatternProjection(node)
            }
        }
    }

    function match(
        context: CallContext,
        pattern: BoundExpression | BoundPattern | BoundVariable,
        value: Value,
        file: Value[]
    ) {
        switch (pattern.kind) {
            case BoundKind.Variable: {
                file[pattern.index] = value
                return true
            }
            case BoundKind.Pattern: {
                const childPattern = pattern.pattern
                switch (childPattern.kind) {
                    case NodeKind.Array:
                        return matchArrayPattern(childPattern)
                    case BoundKind.Record:
                        return matchRecordPattern(childPattern)
                }
            }
            default:
                return valueEquals(e(context, pattern), value)
        }

        function matchArrayPattern(pattern: BoundArrayPattern): boolean {
            if (value.kind != NodeKind.Array) return false
            const values = value.values
            let projection: BoundPatternProjection | undefined = undefined
            let projectionIndex = 0
            loop: for (let i = 0; i < pattern.values.length; i++) {
                const element = pattern.values[i]
                switch (element.kind) {
                    case BoundKind.Projection:
                        projection = element
                        projectionIndex = i
                        break loop
                    default:
                        if (!match(context, element, values[i], file)) return false
                }
            }
            if (!projection) return true
            const postfixCount = pattern.values.length - projectionIndex - 1
            if (postfixCount + projectionIndex >= values.length) return false
            const e = values.length - 1
            for (let i = 0; i > projectionIndex; i--) {
                const element = pattern.values[i]
                if (element.kind == BoundKind.Projection) error("Only one projection allowed in a pattern")
                if (!match(context, element, values[e - i], file)) return false
            }
            const projectedArray: ArrayValue = {
                kind: NodeKind.Array,
                values: values.slice(projectionIndex, e - postfixCount + 1)
            }
            return match(context, projection.value, projectedArray, file)
        }

        function matchRecordPattern(pattern: BoundRecordPattern): boolean {
            if (value.kind != NodeKind.Record) return false
            const cls = value.cls
            const values = value.values
            const seen: boolean[] = []
            let projection: BoundPatternProjection | undefined = undefined
            for (const member of pattern.members) {
                switch (member.kind) {
                    case NodeKind.Member: {
                         const index = cls[member.symbol]
                         if (index === undefined) return false
                         if (!match(context, member.value, values[index], file)) return false
                         seen[member.symbol] = true
                         break
                    }
                    case BoundKind.Projection: {
                        if (projection) error("Only one projection allowed in an array pattern")
                        projection = member
                    }
                }
            }
            if (!projection) return true
            const projectedValues: Value[] = []
            const projectedCls: number[] = []
            cls.forEach((index, symbol) => {
                if (!seen[symbol]) {
                    const projectedIndex = projectedValues.length
                    projectedValues.push(values[index])
                    projectedCls[symbol] = projectedIndex
                }
            })
            const projectedRecord: RecordValue = {
                kind: NodeKind.Record,
                cls: projectedCls,
                values: projectedValues
            }
            return match(context, projection.value, projectedRecord, file)
        }
    }

    function array(node: Value): ArrayValue {
        if (node.kind != NodeKind.Array) error("Expected an array")
        return node
    }

    function record(node: Value): RecordValue {
        if (node.kind != NodeKind.Record) error("Expect a record")
        return node
    }

    function lambda(node: Value): LambdaValue {
        if (node.kind != NodeKind.Lambda) error("Value cannot be called")
        return node
    }

    function int(node: Value): LiteralInt {
        if (node.kind != NodeKind.Literal || node.literal != LiteralKind.Int) error("Expected an integer")
        return node
    }

    function rangeCheck(values: string | Value[], index: number) {
        if (index < 0 || index >= values.length) error(`Index out of bound, $index in [0..${values.length})`)
    }

    function idx(values: Value[], index: number) {
        rangeCheck(values, index)
        return values[index]
    }

    function idxs(value: string, index: number): LiteralInt {
        rangeCheck(value, index)
        return {
            kind: NodeKind.Literal,
            literal: LiteralKind.Int,
            value: value.charCodeAt(index)
        }
    }

    function required(node: Value | undefined): Value {
        if (!node) error("Uninitialized variable")
        return node
    }
}

function contextOf(parent: BindingContext, indexes: Map<string, number>): BindingContext {
    const find = (name: string): ContextBinding | undefined => {
        const index = indexes.get(name)
        if (index !== undefined) {
            return {
                level: 0,
                index
            }
        }
        const prevLevel = parent.find(name)
        if (prevLevel) prevLevel.level++
        return prevLevel
    }
    const spliceQuoteContext = parent.spliceQuoteContext
    const quoteFind = spliceQuoteContext ? parent.quoteFind : find
    return { find, quoteFind, spliceQuoteContext }
}

function swapQuoteSpliceContext(parent: BindingContext): BindingContext {
    return { find: parent.quoteFind, quoteFind: parent.find, spliceQuoteContext: true }
}

export function evaluate(expression: Expression): Value {
    const boundExpression = bind(expression)
    return boundEvaluate(boundExpression)
}

export function classToSymbols(cls: number[]): number[] {
    const symbols: number[] = []
    cls.forEach((index, symbol) => symbols[index] = symbol)
    return symbols
}

function error(message: string): never {
    throw Error(message)
}


export function boundToString(node: BoundExpression): string {
    switch (node.kind) {
        case NodeKind.Literal: return valueToString(node)
        case BoundKind.Reference: return `${node.name}#${node.level}:${node.index}`
        case BoundKind.Let: return `let ${node.bindings.map(boundToString).join()} in ${boundToString(node.body)}`
        case BoundKind.Lambda: return `/(${node.arity}).${boundToString(node.body)}`
        case BoundKind.Call: return `${boundToString(node.target)}(${node.args.map(boundToString).join()})`
        case BoundKind.Record: return `{${node.members.map((member, index) => `${nameOfSymbol(node.symbols[index])}: ${boundExpressionOrProjection(member)}`).join()}}`
        case NodeKind.Array: return `[${node.values.map(boundExpressionOrProjection).join()}]`
        case BoundKind.Select: return `${boundToString(node.target)}.${nameOfSymbol(node.symbol)}`
        case BoundKind.Index: return `${boundToString(node.target)}[${boundToString(node.index)}]`
        case BoundKind.Quote: return `'(${boundToString(node.target)})`
        case BoundKind.Splice: return `$(${boundToString(node.target)})`
        case BoundKind.Match: return `match ${boundToString(node.target)} { ${node.clauses.map(boundClauseToString).join()} }`
    }

    function boundExpressionOrProjection(node: BoundExpression | BoundProjection): string {
        switch (node.kind) {
            case BoundKind.Projection: return `...${boundToString(node.value)}`
            default: return boundToString(node)
        }
    }

    function boundClauseToString(node: BoundMatchClause): string {
        return `${boundExpressionPatternOrVariable(node.pattern)} in ${boundToString(node.value)}`
    }

    function boundExpressionPatternOrVariable(node: BoundExpression | BoundPattern | BoundVariable): string {
        switch (node.kind) {
            case BoundKind.Pattern: return boundRecordOrArrayPattern(node.pattern)
            case BoundKind.Variable: return `${node.name}#${node.index}`
            default: return boundToString(node)
        }
    }

    function boundRecordOrArrayPattern(node: BoundRecordPattern | BoundArrayPattern): string {
        switch (node.kind) {
            case BoundKind.Record: return `{ ${node.members.map(boundProjectionOrMember).join()} }`
            case NodeKind.Array: return `[${node.values.map(boundExpressionPatternVariableOrProjection).join()}]`
        }
    }

    function boundProjectionOrMember(node: BoundPatternProjection | BoundPatternMember): string {
        switch (node.kind) {
            case BoundKind.Projection: return `...${boundExpressionPatternOrVariable(node.value)}`
            case NodeKind.Member: return `${nameOfSymbol(node.symbol)}: ${boundExpressionPatternOrVariable(node.value)}`
        }
    }

    function boundExpressionPatternVariableOrProjection(node: BoundExpression | BoundPattern | BoundVariable | BoundPatternProjection): string {
        switch (node.kind) {
            case BoundKind.Projection: return boundProjectionOrMember(node)
            default: return boundExpressionPatternOrVariable(node)

        }
    }
}