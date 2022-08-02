import { Array, Expression, Literal, LiteralInt, LiteralKind, Member, NodeKind, Pattern, Projection, Record, Variable } from "./ast";

const enum BoundKind {
    Reference = 100,
    Let,
    Record,
    Lambda,
    Call,
    Select,
    Index,
    Projection,
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
    BoundMatch

interface ContextBinding {
    level: number
    index: number
}

interface BindingContext {
    level: number
    find(name: string): ContextBinding | undefined
}

const emptyContext = {
    level: -1,
    find(name: string) { return undefined }
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
                let level = context.level + 1
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
                let level = context.level + 1
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
                            if (indexes.size == 0) return context
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
    }
    return false
}

function valueEq(expression: BoundExpression): Value {
    return e([], expression)

    function e(context: CallContext, node: BoundExpression): Value {
        switch (node.kind) {
            case NodeKind.Literal: return node
            case BoundKind.Reference: return required((context[node.level] ?? [])[node.index])
            case BoundKind.Let: {
                const bindings: Value[] = []
                const letContext = [...context, bindings]
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
                const callContext = [...target.context, args]
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
            case BoundKind.Match: {
                const target = e(context, node.target)
                for (const clause of node.clauses) {
                    const file: Value[] = []
                    if (match(context, clause.pattern, target, file)) {
                        const matchContext = [...context, file]
                        return e(matchContext, clause.value)
                    }
                }
                error("Match not found")
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
    const level = parent.level + 1
    return {
        find(name: string): ContextBinding | undefined {
            const index = indexes.get(name)
            if (index !== undefined) {
                return {
                    level,
                    index
                }
            }
            return parent.find(name)
        },
        level
    }
}

export function evaluate(expression: Expression): Value {
    const boundExpression = bind(expression)
    return valueEq(boundExpression)
}

export function classToSymbols(cls: number[]): number[] {
    const symbols: number[] = []
    cls.forEach((index, symbol) => symbols[index] = symbol)
    return symbols
}

function error(message: string): never {
    throw Error(message)
}
