import { Array, Expression, Literal, LiteralInt, LiteralKind, Member, NodeKind, Projection, Record, Variable } from "./ast";
import { valueToString } from "./value-string";

const enum BoundKind {
    Reference = 100,
    Let,
    Record,
    Array,
    Lambda,
    Call,
    Select,
    Index,
    Projection,
    Quote,
    Splice,
    Match,
    MatchClause,
    Variable
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
    members: BoundExpression[]
}

interface BoundArray {
    kind: BoundKind.Array
    values: BoundExpression[]
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
    pattern: BoundExpression
    value: BoundExpression
}

interface BoundVariable {
    kind: BoundKind.Variable
    name: string // debugging only
    index: number
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
    BoundMatch |
    BoundProjection |
    BoundVariable

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
    allocate(name: string) { return error(`Cannot declare varaible ${name} in this context`) }
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

function bind(node: Expression): BoundExpression {

    return b(intrinsicContext(emptyContext), node)

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
                const members: BoundExpression[] = []
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
                const values: BoundExpression[] = []
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
                    kind: BoundKind.Array,
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
                const quoteContext = swapQuoteSpliceScope(context)
                const target = b(quoteContext, node.target)
                return {
                    kind: BoundKind.Quote,
                    target
                }
            }
            case NodeKind.Splice: {
                const spliceContext = swapQuoteSpliceScope(context)
                const target = b(spliceContext, node.target)
                return {
                    kind: BoundKind.Splice,
                    target
                }
            }
            case NodeKind.Projection: {
                const value = b(context, node.value)
                return {
                    kind: BoundKind.Projection,
                    value
                }
            }
            case NodeKind.Variable: {
                const index = context.scope.allocate(node.name)
                return {
                    kind: BoundKind.Variable,
                    name: node.name,
                    index
                }
            }
            case NodeKind.Match: {
                const target = b(context, node.target)
                const clauses = node.clauses.map<BoundMatchClause>(clause => {
                    const [builder, build] = scopeBuilder(context)
                    const pattern = b(builder, clause.pattern)
                    const [size, clauseContext] = build()
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
    LambdaValue |
    Intrinsic

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
    context: CallContext
    arity: number
    body: BoundExpression
}

export interface Intrinsic {
    kind: NodeKind.Binding
    intrinsic: (file: Value[]) => Value
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
    return e([intrinsics], expression)

    function e(context: CallContext, node: BoundExpression): Value {
        switch (node.kind) {
            case NodeKind.Literal: return node
            case BoundKind.Reference: {
                const result = (context[node.level] ?? [])[node.index]
                if (result === undefined)
                    error(`Internal error: unbound value ${node.name}`)
                return result
            }
            case BoundKind.Projection:
                error("Cannot project in this context")
            case BoundKind.Variable:
                error("Internal error: invalid location for a variable")
            case BoundKind.Let: {
                const bindings: Value[] = []
                const letContext = [bindings, ...context]
                for (const binding of node.bindings) {
                    bindings.push(e(letContext, binding))
                }
                return e(letContext, node.body)
            }
            case BoundKind.Call: {
                const target = e(context, node.target)
                const args = node.args.map(v => e(context, v))
                switch (target.kind) {
                    case NodeKind.Lambda:
                        if (target.arity != node.args.length) {
                            error(`Incorrect number of arguments, expected ${target.arity}, received ${node.args.length}`)
                        }
                        const callContext = [args, ...target.context]
                        return e(callContext, target.body)
                    case NodeKind.Binding:
                        return target.intrinsic(args)
                    default:
                        error("Value cannot be called")
                }
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
            case BoundKind.Array: {
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
                    target: quote(context, node.target)
                }
            }
            case BoundKind.Splice: {
                const target = e(context, node.target)
                switch (target.kind) {
                    case NodeKind.Quote:
                        return e(context, target.target)
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
            case BoundKind.Variable: return node
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
            case BoundKind.Projection: {
                const value = quote(context, node.value)
                return {
                    kind: BoundKind.Projection,
                    value
                }
            }
            case BoundKind.Splice: {
                const target = e(context, node.target)
                switch (target.kind) {
                    case NodeKind.Quote:
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

        function quoteClause(node: BoundMatchClause): BoundMatchClause {
            const pattern = quote(context, node.pattern)
            const value = quote(context, node.value)
            return {
                kind: BoundKind.MatchClause,
                size: node.size,
                pattern,
                value
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
                return valueEquals(e(context, pattern), value)
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
                        if (projection) error("Only one projection allowed in an array pattern")
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

    function array(node: Value): ArrayValue {
        if (node.kind != NodeKind.Array) error("Expected an array")
        return node
    }

    function record(node: Value): RecordValue {
        if (node.kind != NodeKind.Record) error("Expect a record")
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


function scopeBuilder(parent: BindingContext): [BindingContext, () => [number, BindingContext]] {
    const indexes = new Map<string, number>()

    function allocate(name: string): number {
        const last = indexes.get(name)
        if (last !== undefined) return last
        const index = indexes.size
        indexes.set(name, index)
        return index
    }

    function build(): [number, BindingContext] {
        return [indexes.size, contextOf(parent, indexes)]
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
    }

    function boundClauseToString(node: BoundMatchClause): string {
        return `${boundToString(node.pattern)} in ${boundToString(node.value)}`
    }
}

function toInt(value: Value): number {
    if (value && value.kind == NodeKind.Literal && value.literal == LiteralKind.Int) {
        return value.value
    }
    error("Required an integer")
}

function toLengthable(value: Value): { length: number } {
    if (value) {
        switch (value.kind) {
            case NodeKind.Literal:
                if (value.literal == LiteralKind.String) return value.value
                break
            case NodeKind.Array:
                return value.values
        }
    }
    error("Require an array or string")
}

function int(value: number): Value {
    return {
        kind: NodeKind.Literal,
        literal: LiteralKind.Int,
        value
    }
}

function bool(value: boolean): Value {
    return {
        kind: NodeKind.Literal,
        literal: LiteralKind.Boolean,
        value
    }
}

const enum IntOp {
    Add,
    Subtract,
    Multiple,
    Divide,
    Less
}

const intrinsics: Value[] = []

function intrinsicContext(parent: BindingContext): BindingContext {
    const map = new Map<string, number>()
    function define(name: string, intrinsic: (file: Value[]) => Value) {
        const index = intrinsics.length
        intrinsics.push({
            kind: NodeKind.Binding,
            intrinsic
        })
        map.set(name, index)
    }
    define("iadd", ([left, right]) => int(toInt(left) + toInt(right)))
    define("isub", ([left, right]) => int(toInt(left) - toInt(right)))
    define("imul", ([left, right]) => int(toInt(left) * toInt(right)))
    define("idiv", ([left, right]) => int(toInt(left) / toInt(right)))
    define("iless", ([left, right]) => bool(toInt(left) < toInt(right)))
    define("len", ([target]) => int(toLengthable(target).length))
    return contextOf(parent, map)
}