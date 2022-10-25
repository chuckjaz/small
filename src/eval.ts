import { Expression, Literal, LiteralInt, LiteralKind, NodeKind } from "./ast";
import { Location } from './files'
import { valueToString } from "./value-string";

const enum BoundKind {
    Reference = 100,
    Let,
    Record,
    Array,
    Import,
    Lambda,
    Call,
    Select,
    Index,
    Projection,
    Quote,
    Splice,
    Match,
    MatchClause,
    Variable,
    Debug,
    LambdaBody,
}

interface BoundReference {
    kind: BoundKind.Reference,
    start: number
    name: string // debugging only
    level: number
    index: number
}

interface BoundLet {
    kind: BoundKind.Let
    bindings: BoundExpression[]
    body: BoundExpression
    symbols: number[] // debugger
}

interface BoundImport {
    kind: BoundKind.Import
    start: number
    name: string
    value: Value
}

interface BoundLambda {
    kind: BoundKind.Lambda
    start: number
    arity: number
    body: BoundExpression
    symbols: number[] // debugger
}

interface BoundCall {
    kind: BoundKind.Call
    start: number
    args: BoundExpression[]
    target: BoundExpression
}

interface BoundSelect {
    kind: BoundKind.Select
    start: number
    target: BoundExpression
    name: string // Debugging only
    symbol: number
}

interface BoundIndex {
    kind: BoundKind.Index
    start: number
    target: BoundExpression
    index: BoundExpression
}

interface BoundRecord {
    kind: BoundKind.Record
    symbols: number[]
    members: BoundExpression[]
}

interface BoundArray {
    kind: BoundKind.Array
    start: number
    values: BoundExpression[]
}

interface BoundProjection {
    kind: BoundKind.Projection
    start: number
    value: BoundExpression
}

interface BoundQuote {
    kind: BoundKind.Quote
    start: number
    target: BoundExpression
}

interface BoundSplice {
    kind: BoundKind.Splice
    start: number
    target: BoundExpression
}

interface BoundMatch {
    kind: BoundKind.Match
    start: number
    target: BoundExpression
    clauses: BoundMatchClause[]
}

interface BoundMatchClause {
    kind: BoundKind.MatchClause
    size: number
    pattern: BoundExpression
    value: BoundExpression
    symbols: number[]
}

interface BoundVariable {
    kind: BoundKind.Variable
    start: number
    name: string // debugging only
    index: number
}

interface BoundDebug {
    kind: BoundKind.Debug
    start: number
    value: BoundExpression
}

interface BoundLambdaBody {
    kind: BoundKind.LambdaBody
    start: number
    body: BoundExpression
}

export type BoundExpression =
    Literal |
    ErrorValue |
    BoundReference |
    BoundLet |
    BoundImport |
    BoundLambda |
    BoundCall |
    BoundRecord |
    BoundArray |
    BoundSelect |
    BoundIndex |
    BoundQuote |
    BoundSplice |
    BoundMatch |
    BoundProjection |
    BoundVariable |
    BoundDebug |
    BoundLambdaBody

interface ContextBinding {
    level: number
    index: number
}

interface Scope {
    find(name: string): ContextBinding | undefined
    allocate(name: string): number
}

interface BindingContext {
    scope: Scope
    quoteScope: Scope
    spliceQuoteContext: boolean
}

const emptyScope: Scope = {
    find(name: string) { return undefined },
    allocate(name: string) { return error(null, `Cannot declare varaible ${name} in this context`) }
}

const emptyContext: BindingContext = {
    scope: emptyScope,
    quoteScope: emptyScope,
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

function bind(node: Expression, imports?: (name: string) => Value): BoundExpression {

    return b(emptyContext, node)

    function b(context: BindingContext, node: Expression): BoundExpression {
        switch (node.kind) {
            case NodeKind.Literal: return node
            case NodeKind.Reference: {
                const location = context.scope.find(node.name)
                const name = node.name
                if (location) {
                    const { level, index } = location
                    return {
                        kind: BoundKind.Reference,
                        start: node.start,
                        name,
                        level,
                        index
                    }
                } else {
                    error(node, `Undefined "${name}"`)
                }
            }
            case NodeKind.Let: {
                const indexes = new Map<string, number>()
                let index = 0
                const symbols: number[] = []
                for (const binding of node.bindings) {
                    const name = binding.name
                    if (indexes.has(name)) {
                        error(node, `Duplicate variable name $name`)
                    }
                    indexes.set(name, index++)
                    symbols.push(symbolOf(name))
                }
                const letContext = contextOf(context, indexes)
                const bindings = node.bindings.map(binding => b(letContext, binding.value))
                const body = b(letContext, node.body)
                return {
                    kind: BoundKind.Let,
                    bindings,
                    body,
                    symbols
                }
            }
            case NodeKind.Import: {
                const name = node.name
                const value = imports ? imports(name) : undefined
                if (value && value.kind == NodeKind.Error) {
                    if (value.start == 0) value.start = node.start
                    return value
                }
                if (!value) return  {
                    kind: NodeKind.Error,
                    start: node.start,
                    message: `Import "${name}" not found`
                }
                return {
                    kind: BoundKind.Import,
                    start: node.start,
                    name,
                    value
                }
            }
            case NodeKind.Lambda: {
                const indexes = node.parameters.reduce((map, name, index) => (map.set(name, index), map), new Map<string, number>())
                const lambdaContext = contextOf(context, indexes)
                const body = b(lambdaContext, node.body)
                const symbols = node.parameters.map(name => symbolOf(name))
                return {
                    kind: BoundKind.Lambda,
                    start: node.start,
                    arity: indexes.size,
                    body,
                    symbols
                }
            }
            case NodeKind.Call: {
                let target = b(context, node.target)
                let args = node.args.map(arg => b(context, arg))
                return {
                    kind: BoundKind.Call,
                    start: node.start,
                    target,
                    args
                }
            }
            case NodeKind.Record: {
                const symbols: number[] = []
                const members: BoundExpression[] = []
                for (const member of node.members) {
                    switch (member.kind) {
                        case NodeKind.Projection: {
                            const value = b(context, member.value)
                            members.push({
                                kind: BoundKind.Projection,
                                start: member.start,
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
                const values: BoundExpression[] = []
                for (const value of node.values) {
                    switch (value.kind) {
                        case NodeKind.Projection: {
                            const v = b(context, value.value)
                            values.push({
                                kind: BoundKind.Projection,
                                start: value.start,
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
                    kind: BoundKind.Array,
                    start: node.start,
                    values
                }
            }
            case NodeKind.Select: {
                const target = b(context, node.target)
                const name = node.name
                const symbol = symbolOf(name)
                return {
                    kind: BoundKind.Select,
                    start: node.start,
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
                    start: node.start,
                    target,
                    index
                }
            }
            case NodeKind.Quote: {
                const quoteContext = swapQuoteSpliceScope(context)
                const target = b(quoteContext, node.target)
                return {
                    kind: BoundKind.Quote,
                    start: node.start,
                    target
                }
            }
            case NodeKind.Splice: {
                const spliceContext = swapQuoteSpliceScope(context)
                const target = b(spliceContext, node.target)
                return {
                    kind: BoundKind.Splice,
                    start: node.start,
                    target
                }
            }
            case NodeKind.Projection: {
                const value = b(context, node.value)
                return {
                    kind: BoundKind.Projection,
                    start: node.start,
                    value
                }
            }
            case NodeKind.Variable: {
                const index = context.scope.allocate(node.name)
                return {
                    kind: BoundKind.Variable,
                    start: node.start,
                    name: node.name,
                    index
                }
            }
            case NodeKind.Match: {
                const target = b(context, node.target)
                const clauses = node.clauses.map<BoundMatchClause>(clause => {
                    const [builder, build] = scopeBuilder(context)
                    const pattern = b(builder, clause.pattern)
                    const [size, clauseContext, symbols] = build()
                    const value = b(clauseContext, clause.value)

                    return {
                        kind: BoundKind.MatchClause,
                        pattern,
                        size,
                        value,
                        symbols
                    }
                })
                return {
                    kind: BoundKind.Match,
                    start: node.start,
                    target,
                    clauses
                }
            }
        }
    }
}

export type CallContextFile = Value[] & { symbols?: number[] }
export type CallContext = CallContextFile[]

export type Value =
    Literal |
    RecordValue |
    ArrayValue |
    QuoteValue |
    LambdaValue |
    Imported |
    ErrorValue

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
    target: BoundExpression
}

export interface LambdaValue {
    kind: NodeKind.Lambda
    start: number
    context: CallContext
    arity: number
    body: BoundExpression
    symbols: number[]
}

export interface Imported {
    kind: NodeKind.Import
    name: string
    fun: (file: Value[]) => Value
}

export interface ErrorValue {
    kind: NodeKind.Error
    start: number
    stack?: number[]
    message: string
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
            break
        }
        case NodeKind.Error: {
            if (a.message == (b as ErrorValue).message) return true
        }
    }
    return false
}

export interface Debugger {
    startFunction(location: number, callContext: CallContext): void
    endFunction(location: number): void
    statement(location: number, callContext: CallContext): boolean
}

function debuggerTransform(node: BoundExpression): BoundExpression {

    function wrap(node: BoundExpression): BoundExpression {
        if (node.kind == BoundKind.Debug) return node
        if ('start' in node) {
            return {
                kind: BoundKind.Debug,
                start: node.start,
                value: node
            }
        }
        return node
    }

    function rwrap(node: BoundExpression): BoundExpression {
        return wrap(debuggerTransform(node))
    }

    function wrapBody(node: BoundExpression, start: number): BoundExpression {
        return {
            kind: BoundKind.LambdaBody,
            start,
            body: node
        }
    }

    switch (node.kind) {
        case NodeKind.Literal: return node
        case NodeKind.Error: return node
        case BoundKind.Reference: return node
        case BoundKind.Projection: return node
        case BoundKind.Let:
            return {
                kind: BoundKind.Let,
                bindings: node.bindings.map(debuggerTransform),
                body: rwrap(node.body),
                symbols: node.symbols
            }
        case BoundKind.Import: return node
        case BoundKind.Lambda:
            return {
                kind: BoundKind.Lambda,
                start: node.start,
                arity: node.arity,
                body: wrapBody(rwrap(node.body), node.start),
                symbols: node.symbols
            }
        case BoundKind.Call:
            return wrap({
                kind: BoundKind.Call,
                args: node.args.map(debuggerTransform),
                target: debuggerTransform(node.target),
                start: node.start
            })
        case BoundKind.Record:
            return {
                kind: BoundKind.Record,
                members: node.members.map(debuggerTransform),
                symbols: node.symbols
            }
        case BoundKind.Array:
            return {
                kind: BoundKind.Array,
                values: node.values.map(debuggerTransform),
                start: node.start
            }
        case BoundKind.Select:
            return {
                kind: BoundKind.Select,
                target: debuggerTransform(node.target),
                symbol: node.symbol,
                name: node.name,
                start: node.start
            }
        case BoundKind.Index:
            return {
                kind: BoundKind.Index,
                target: debuggerTransform(node.target),
                index: debuggerTransform(node.index),
                start: node.start
            }
        case BoundKind.Quote: return node
        case BoundKind.Splice:
            return {
                kind: BoundKind.Splice,
                target: debuggerTransform(node.target),
                start: node.start
            }
        case BoundKind.Match:
            return {
                kind: BoundKind.Match,
                target: debuggerTransform(node.target),
                clauses: node.clauses.map(clause => {
                    return {
                        kind: BoundKind.MatchClause,
                        size: clause.size,
                        pattern: debuggerTransform(clause.pattern),
                        value: rwrap(clause.value),
                        symbols: clause.symbols
                    }
                }),
                start: node.start
            }
        case BoundKind.Variable: return node
        case BoundKind.Debug: return node
        case BoundKind.LambdaBody: return node
    }
}

function boundEvaluate(expression: BoundExpression, dbg?: Debugger): Value {
    if (dbg) {
        expression = debuggerTransform(expression)
    }
    return resolve(e([], expression))

    type Continue = () => Step
    type Step = Value | Continue

    function resolve(step: Step): Value {
        while (true) {
            switch (typeof step) {
                case 'function': step = step(); break
                default: return step as Value
            }
        }
    }

    function errorValue(location: Location, message: string): ErrorValue {
        return {
            kind: NodeKind.Error,
            start: location.start,
            message
        }
    }

    function e(context: CallContext, node: BoundExpression): Step {
        switch (node.kind) {
            case NodeKind.Literal: return node
            case NodeKind.Error: return node
            case BoundKind.Reference: {
                const result = (context[node.level] ?? [])[node.index]
                if (result === undefined)
                    error(node, `Internal error: unbound value ${node.name}`)
                return result
            }
            case BoundKind.Projection:
                return errorValue(node, "Cannot project in this context")
            case BoundKind.Variable:
                return errorValue(node, "Internal error: invalid location for a variable")
            case BoundKind.Import: return node.value
            case BoundKind.Let: {
                const bindings: CallContextFile = []
                bindings.symbols = node.symbols
                const letContext = [bindings, ...context]
                for (const binding of node.bindings) {
                    const value = resolve(e(letContext, binding))
                    if (value.kind == NodeKind.Error) return value
                    bindings.push(value)
                }
                return e(letContext, node.body)
            }
            case BoundKind.Call: {
                const target = resolve(e(context, node.target))
                if (target.kind == NodeKind.Error) return target
                const args: CallContextFile = []
                for (const arg of node.args) {
                    const v = resolve(e(context, arg))
                    if (v.kind == NodeKind.Error) return v
                    args.push(v)
                }
                switch (target.kind) {
                    case NodeKind.Lambda:
                        if (target.arity != node.args.length) {
                            return  errorValue(node, `Incorrect number of arguments, expected ${target.arity}, received ${node.args.length}`)
                        }
                        args.symbols = target.symbols
                        const callContext = [args, ...target.context]
                        return () => {
                            const result = e(callContext, target.body)
                            if (typeof result == 'object' && result.kind == NodeKind.Error) {
                                if (!result.stack) result.stack = []
                                result.stack?.push(node.start)
                            }
                            return result
                        }
                    case NodeKind.Import:
                        return target.fun(args)
                    default:
                        return errorValue(node, "Value cannot be called")
                }
            }
            case BoundKind.Index: {
                const target = resolve(e(context, node.target))
                if (target.kind == NodeKind.Error) return target
                const index = int(node, resolve(e(context, node.index)))
                if (index.kind == NodeKind.Error) return index
                switch (target.kind) {
                    case NodeKind.Array:
                        return idx(node, target.values, index.value)
                    case NodeKind.Literal:
                        if (target.literal == LiteralKind.String) {
                            return idxs(node, target.value, index.value)
                        }
                        // fall-through
                    default:
                        return errorValue(node, "Value cannot be indexed")
                }
            }
            case BoundKind.Select: {
                const target = record(node, resolve(e(context, node.target)))
                if (target.kind == NodeKind.Error) return target
                const symbol = node.symbol
                const index = target.cls[symbol]
                if (index == undefined) {
                    return errorValue(node, `Member "${node.name}" not found`)
                }
                return target.values[index]
            }
            case BoundKind.Array: {
                const values: Value[] = []
                for (const value of node.values) {
                    switch (value.kind) {
                        case BoundKind.Projection: {
                            const a = array(value, resolve(e(context, value.value)))
                            if (a.kind == NodeKind.Error) return a
                            values.push(...a.values)
                            break
                        }
                        default:
                            const element = resolve(e(context, value))
                            if (element.kind == NodeKind.Error) return element
                            values.push(element)
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
                let index = 0
                for (const member of node.members) {
                    switch (member.kind) {
                        case BoundKind.Projection:
                            const r = record(member, resolve(e(context, member.value)))
                            if (r.kind == NodeKind.Error) return r
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
                            const m = resolve(e(context, member))
                            if (m.kind == NodeKind.Error) return m
                            values.push(m)
                            break
                    }
                    index++
                }
                return {
                    kind: NodeKind.Record,
                    cls,
                    values
                }
            }
            case BoundKind.Lambda: {
                return {
                    kind: NodeKind.Lambda,
                    start: node.start,
                    context,
                    arity: node.arity,
                    body: node.body,
                    symbols: node.symbols
                }
            }
            case BoundKind.Quote: {
                return {
                    kind: NodeKind.Quote,
                    target: quote(context, node.target)
                }
            }
            case BoundKind.Splice: {
                const target = resolve(e(context, node.target))
                switch (target.kind) {
                    case NodeKind.Quote:
                        return e(context, target.target)
                    case NodeKind.Error:
                        return target
                    default:
                        return errorValue(node, `Can only splice a quote: ${valueToString(target)}`)
                }
            }
            case BoundKind.Match: {
                const target = resolve(e(context, node.target))
                if (target.kind == NodeKind.Error) return target
                for (const clause of node.clauses) {
                    const file: CallContextFile = []
                    if (match(context, clause.pattern, target, file)) {
                        file.symbols = clause.symbols
                        const matchContext = [file, ...context]
                        return e(matchContext, clause.value)
                    }
                }
                return errorValue(node, `Match not found for ${valueToString(target)}`)
            }
            case BoundKind.Debug: {
                const value = node.value
                if (dbg?.statement(node.start, context) == false) {
                    return errorValue(node, "Terminate")
                }
                return e(context, node.value)
            }
            case BoundKind.LambdaBody: {
                dbg?.startFunction(node.start, context)
                const value = e(context, node.body)
                dbg?.endFunction(node.start)
                return value
            }
        }
    }

    function quote(context: CallContext, node: BoundExpression): BoundExpression {
        switch (node.kind) {
            case NodeKind.Literal: return node
            case NodeKind.Error: return node
            case BoundKind.Reference: return node
            case BoundKind.Variable: return node
            case BoundKind.Let: {
                const bindings = node.bindings.map(b => quote(context, b))
                const body = quote(context, node.body)
                return {
                    kind: BoundKind.Let,
                    bindings,
                    body,
                    symbols: node.symbols
                }
            }
            case BoundKind.Import: return node
            case BoundKind.Lambda: {
                const body = quote(context, node.body)
                return {
                    kind: BoundKind.Lambda,
                    start: node.start,
                    arity: node.arity,
                    body,
                    symbols: node.symbols
                }
            }
            case BoundKind.Call: {
                const target = quote(context, node.target)
                const args = node.args.map(a => quote(context, a))
                return {
                    kind: BoundKind.Call,
                    start: node.start,
                    target,
                    args
                }
            }
            case BoundKind.Record: {
                const members = node.members.map(m => quote(context, m))
                return {
                    kind: BoundKind.Record,
                    symbols: node.symbols,
                    members
                }
            }
            case BoundKind.Array: {
                const values = node.values.map(e => quote(context, e))
                return {
                    kind: BoundKind.Array,
                    start: node.start,
                    values
                }
            }
            case BoundKind.Select: {
                const target = quote(context, node.target)
                return {
                    kind: BoundKind.Select,
                    start: node.start,
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
                    start: node.start,
                    target,
                    index
                }
            }
            case BoundKind.Quote: return node
            case BoundKind.Projection: {
                const value = quote(context, node.value)
                return {
                    kind: BoundKind.Projection,
                    start: node.start,
                    value
                }
            }
            case BoundKind.Splice: {
                const target = resolve(e(context, node.target))
                switch (target.kind) {
                    case NodeKind.Quote:
                        return target.target
                    default:
                        return errorValue(node, `Can only splice a quote: ${valueToString(target)}`)
                }
            }
            case BoundKind.Match: {
                const target = quote(context, node.target)
                const clauses = node.clauses.map(quoteClause)
                return {
                    kind: BoundKind.Match,
                    start: node.start,
                    target,
                    clauses
                }
            }
            case BoundKind.Debug: {
                const value = quote(context, node.value)
                return {
                    kind: BoundKind.Debug,
                    start: node.start,
                    value
                }
            }
            case BoundKind.LambdaBody: {
                const body = quote(context, node.body)
                return {
                    kind: BoundKind.LambdaBody,
                    start: node.start,
                    body
                }
            }
        }

        function quoteClause(node: BoundMatchClause): BoundMatchClause {
            const pattern = quote(context, node.pattern)
            const value = quote(context, node.value)
            return {
                kind: BoundKind.MatchClause,
                size: node.size,
                pattern,
                value,
                symbols: node.symbols
            }
        }
    }

    function match(context: CallContext, pattern: BoundExpression, value: Value, file: Value[]) {
        switch (pattern.kind) {
            case BoundKind.Variable: {
                file[pattern.index] = value
                return true
            }
            case BoundKind.Record:
                return matchRecordPattern(pattern)
            case BoundKind.Array:
                return matchArrayPattern(pattern)
            default:
                return valueEquals(resolve(e(context, pattern)), value)
        }

        function matchArrayPattern(pattern: BoundArray): boolean {
            if (value.kind != NodeKind.Array) return false
            const values = value.values
            let projection: BoundProjection | undefined = undefined
            let projectionIndex = 0
            loop: for (let i = 0; i < pattern.values.length; i++) {
                const element = pattern.values[i]
                switch (element.kind) {
                    case BoundKind.Projection:
                        projection = element
                        projectionIndex = i
                        break loop
                    default:
                        if (i >= values.length) return false
                        if (!match(context, element, values[i], file)) return false
                }
            }
            if (!projection) return pattern.values.length == values.length
            const postfixCount = pattern.values.length - projectionIndex - 1
            if (postfixCount + projectionIndex > values.length) return false
            const e = values.length - 1
            for (let i = 0; i > projectionIndex; i--) {
                const element = pattern.values[i]
                if (element.kind == BoundKind.Projection) error(pattern, "Only one projection allowed in a pattern")
                if (!match(context, element, values[e - i], file)) return false
            }
            const projectedArray: ArrayValue = {
                kind: NodeKind.Array,
                values: values.slice(projectionIndex, e - postfixCount + 1)
            }
            return match(context, projection.value, projectedArray, file)
        }

        function matchRecordPattern(pattern: BoundRecord): boolean {
            if (value.kind != NodeKind.Record) return false
            const cls = value.cls
            const values = value.values
            const seen: boolean[] = []
            let projection: BoundProjection | undefined = undefined
            let i = 0;
            for (const member of pattern.members) {
                switch (member.kind) {
                    case BoundKind.Projection: {
                        if (projection) error(member, "Only one projection allowed in an array pattern")
                        projection = member
                        break
                    }
                    default: {
                        const symbol = pattern.symbols[i++]
                        const index = cls[symbol]
                        if (index === undefined) return false
                        if (!match(context, member, values[index], file)) return false
                        seen[symbol] = true
                        break
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

    function array(location: Location, node: Value): ArrayValue | ErrorValue {
        switch (node.kind) {
            case NodeKind.Array:
            case NodeKind.Error:
                return node
        }
        return errorValue(location, `Expected an array: ${valueToString(node)}`)
    }

    function record(location: Location, node: Value): RecordValue | ErrorValue {
        switch (node.kind) {
            case NodeKind.Record:
            case NodeKind.Error:
                return node
        }
        return errorValue(location, `Expected a record: ${valueToString(node)}`)
    }

    function int(location: Location, node: Value): LiteralInt | ErrorValue {
        switch (node.kind) {
            case NodeKind.Literal:
                if (node.literal == LiteralKind.Int) return node
                break
            case NodeKind.Error: return node
        }
        return errorValue(location, "Expected an integer")
    }

    function rangeCheck(location: Location, values: string | Value[], index: number): ErrorValue | undefined {
        if (index < 0 || index >= values.length) return errorValue(location, `Index out of bound, ${index} in 0..${values.length}`)
    }

    function idx(location: Location, values: Value[], index: number): Value {
        return rangeCheck(location, values, index) ?? values[index]
    }

    function idxs(location: Location, value: string, index: number): LiteralInt | ErrorValue {
        return rangeCheck(location, value, index) ?? {
            kind: NodeKind.Literal,
            start: 0,
            literal: LiteralKind.Int,
            value: value.charCodeAt(index)
        }
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
        const prevLevel = parent.scope.find(name)
        if (prevLevel) prevLevel.level++
        return prevLevel
    }
    const allocate = parent.scope.allocate
    const scope: Scope = {
        find,
        allocate
    }
    const spliceQuoteContext = parent.spliceQuoteContext
    const quoteScope = spliceQuoteContext ? parent.quoteScope : scope
    return { scope, quoteScope, spliceQuoteContext }
}


function scopeBuilder(parent: BindingContext): [BindingContext, () => [number, BindingContext, number[]]] {
    const indexes = new Map<string, number>()
    const symbols: number[] = []

    function allocate(name: string): number {
        const last = indexes.get(name)
        if (last !== undefined) return last
        const index = indexes.size
        indexes.set(name, index)
        symbols.push(symbolOf(name))
        return index
    }

    function build(): [number, BindingContext, number[]] {
        return [indexes.size, contextOf(parent, indexes), symbols]
    }

    const scope: Scope = {
        find: parent.scope.find,
        allocate
    }

    const context: BindingContext = {
        scope,
        quoteScope: parent.quoteScope,
        spliceQuoteContext: parent.spliceQuoteContext
    }

    return [context, build]
}

function swapQuoteSpliceScope(parent: BindingContext): BindingContext {
    return { scope: parent.quoteScope, quoteScope: parent.scope, spliceQuoteContext: true }
}

export function importedOf(name: string, fun: (file: Value[]) => Value): Imported {
    function errorWrapper(file: Value[]): Value {
        try {
            return fun(file)
        } catch(e) {
            return {
                kind: NodeKind.Error,
                start: 0,
                message: (e as any).message
            }
        }
    }
    return {
        kind: NodeKind.Import,
        name,
        fun: errorWrapper
    }
}

export function evaluate(expression: Expression, imports?: (name: string) => Value, dbg?: Debugger): Value {
    const boundExpression = bind(expression, imports)
    return boundEvaluate(boundExpression, dbg)
}

export function classToSymbols(cls: number[]): number[] {
    const symbols: number[] = []
    cls.forEach((index, symbol) => symbols[index] = symbol)
    return symbols
}

function error(location: Location | null, message: string): never {
    const err = new Error(message);
    if (location) (err as any).start = location.start
    throw err
}

export function kindToString(kind: number): string {
    switch (kind) {
        case NodeKind.Literal: return "Literal"
        case NodeKind.Error: return "Error"
        case BoundKind.Reference: return "Reference"
        case BoundKind.Let: return "Let"
        case BoundKind.Import: return "Import"
        case BoundKind.Lambda: return "Lambda"
        case BoundKind.Call: return "Call"
        case BoundKind.Record: return "Return"
        case BoundKind.Array: return "Array"
        case BoundKind.Select: return "Select"
        case BoundKind.Index: return "Index"
        case BoundKind.Quote: return "Quote"
        case BoundKind.Splice: return "Splice"
        case BoundKind.Projection: return "Projection"
        case BoundKind.Match: return "Match"
        case BoundKind.Variable: return "Variable"
        case BoundKind.Debug: return "Debug"
        case BoundKind.LambdaBody: return "LambdaBody"
    }
    return `unknown: ${kind}`
}
export function boundToString(node: BoundExpression): string {
    switch (node.kind) {
        case NodeKind.Literal: return valueToString(node)
        case NodeKind.Error: return valueToString(node)
        case BoundKind.Reference: return `${node.name}#${node.level}:${node.index}`
        case BoundKind.Let: return `let ${node.bindings.map(boundToString).join()} in ${boundToString(node.body)}`
        case BoundKind.Import: return `import ${node.name}`
        case BoundKind.Lambda: return `/(${node.arity}).${boundToString(node.body)}`
        case BoundKind.Call: return `${boundToString(node.target)}(${node.args.map(boundToString).join()})`
        case BoundKind.Record: return `{${node.members.map((member, index) =>
            member.kind == BoundKind.Projection ? boundToString(member) : `${nameOfSymbol(node.symbols[index])}: ${boundToString(member)}`).join()}}`
        case BoundKind.Array: return `[${node.values.map(boundToString).join()}]`
        case BoundKind.Select: return `${boundToString(node.target)}.${nameOfSymbol(node.symbol)}`
        case BoundKind.Index: return `${boundToString(node.target)}[${boundToString(node.index)}]`
        case BoundKind.Quote: return `'(${boundToString(node.target)})`
        case BoundKind.Splice: return `$(${boundToString(node.target)})`
        case BoundKind.Projection: return `...${boundToString(node.value)}`
        case BoundKind.Match: return `match ${boundToString(node.target)} { ${node.clauses.map(boundClauseToString).join()} }`
        case BoundKind.Variable: return `#${node.index}${node.name}`
        case BoundKind.Debug: return `debug: ${boundToString(node.value)}`
        case BoundKind.LambdaBody: return `debug: ${boundToString(node.body)}`
    }

    function boundClauseToString(node: BoundMatchClause): string {
        return `${boundToString(node.pattern)} in ${boundToString(node.value)}`
    }
}
