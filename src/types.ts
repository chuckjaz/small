import { Expression, LiteralKind, LiteralNull, NodeKind, Projection, Variable } from "./ast"

export const enum TypeKind {
    Boolean,
    Int,
    Float,
    String,
    Null,
    Lambda,
    Record,
    Array,
    Variable,
    Error,
}

export interface TypeBase {
    hasOpen?: Boolean
}

export interface BooleanType extends TypeBase {
    kind: TypeKind.Boolean
}

export interface IntType extends TypeBase {
    kind: TypeKind.Int
}

export interface FloatType extends TypeBase {
    kind: TypeKind.Float
}

export interface StringType extends TypeBase {
    kind: TypeKind.String
}

export interface NullType extends TypeBase {
    kind: TypeKind.Null
}

export interface LambdaType extends TypeBase {
    kind: TypeKind.Lambda
    parameters: Type[]
    result: Type
}

export interface RecordTypeMember extends TypeBase {
    name: string
    type: Type
}

export interface RecordType extends TypeBase {
    kind: TypeKind.Record
    members: RecordTypeMember[]
}

export interface ArrayType extends TypeBase {
    kind: TypeKind.Array
    // TODO: consider allowing arrays to form tuples
    element: Type
}

export interface TypeBinding {
    type?: Type
    len: number
}

export interface TypeBindingLink {
    next: TypeBindingLink
    binding: TypeBinding
}

export interface TypeVariable extends TypeBase {
    kind: TypeKind.Variable
    link: TypeBindingLink
}

export interface ErrorMessage {
    start: number
    message: string
}

export interface ErrorType extends TypeBase {
    kind: TypeKind.Error
    messages: ErrorMessage[]
}

export type Type =
    BooleanType |
    IntType |
    FloatType |
    StringType |
    NullType |
    LambdaType |
    RecordType |
    ArrayType |
    TypeVariable |
    ErrorType

const booleanType: BooleanType = { kind: TypeKind.Boolean }
const intType: IntType = { kind: TypeKind.Int }
const floatType: FloatType = { kind: TypeKind.Float }
const stringType: StringType = { kind: TypeKind.String }
const nullType: NullType = { kind: TypeKind. Null }

function freshOpen(): TypeVariable {
    const binding: TypeBinding = { len: 1 }
    const link = { binding } as TypeBindingLink
    link.next = link
    return { kind: TypeKind.Variable, link }
}

function hasOpenTypes(type: Type): boolean {
    if ('hasOpen' in type) return type.hasOpen === true
    let result = false
    switch (type.kind) {
        case TypeKind.Boolean:
        case TypeKind.Error:
        case TypeKind.Float:
        case TypeKind.Int:
        case TypeKind.Null:
        case TypeKind.String:
            result = false
            break
        case TypeKind.Variable:
            result = !type.link.binding.type
            break
        case TypeKind.Array:
            result = hasOpenTypes(type.element);
            break
        case TypeKind.Record:
            result = type.members.some(m => hasOpenTypes(m.type))
            break
        case TypeKind.Lambda:
            result = type.parameters.some(hasOpenTypes) || hasOpenTypes(type.result)
            break
    }
    type.hasOpen = result
    return result
}

function freshOpens(type: Type): Type {
    if (hasOpenTypes(type)) {
        const openMap = new Map<TypeVariable, TypeVariable>()

        function clone(type: Type): Type {
            switch (type.kind) {
                case TypeKind.Boolean:
                case TypeKind.Error:
                case TypeKind.Float:
                case TypeKind.Int:
                case TypeKind.Null:
                case TypeKind.String:
                    return type
                case TypeKind.Variable: {
                    const bound = type.link.binding.type
                    if (bound) return clone(bound)
                    let newOpen = openMap.get(type)
                    if (!newOpen) {
                        newOpen = freshOpen()
                        openMap.set(type, newOpen)
                    }
                    return newOpen
                }
                case TypeKind.Array:
                    return { kind: TypeKind.Array, element: clone(type.element) }
                case TypeKind.Lambda:
                    return {
                        kind: TypeKind.Lambda,
                        parameters: type.parameters.map(clone),
                        result: clone(type.result)
                    }
                case TypeKind.Record:
                    return {
                        kind: TypeKind.Record,
                        members: type.members.map(m => ({ name: m.name, type: clone(m.type) }))
                    }
            }
        }

        let result = clone(type)

        // Check if the types were closed after this was calculated.
        if (openMap.size == 0) {
            // If no types were actually mapped then this type no longer has open variables.
            type.hasOpen = false
            return type
        }
        return result
    }
    return type
}

export function typeToString(type: Type): string {
    const openNames = new Map<TypeBinding, string>()
    function convert(type: Type): string {
        switch (type.kind) {
            case TypeKind.Boolean:
                return "boolean"
            case TypeKind.Int:
                return "int"
            case TypeKind.Float:
                return "float"
            case TypeKind.String:
                return "string"
            case TypeKind.Null:
                return "null"
            case TypeKind.Lambda:
                return `(${type.parameters.map(convert).join(", ")})->${convert(type.result)}`
            case TypeKind.Record:
                return `{ ${type.members.map(m => `${m.name}: ${convert(m.type)}}`).join(", ") }}`
            case TypeKind.Array:
                return `[...${convert(type.element)}]`
            case TypeKind.Variable:
                const binding = type.link.binding
                let name = openNames.get(binding)
                if (!name) {
                    name = openName(openNames.size)
                    openNames.set(binding, name)
                }
                return `'${name}`
            case TypeKind.Error:
                return `error`
        }
    }

    return convert(type)
}

function openName(index: number): string {
    const a = 'a'.charCodeAt(0)
    if (index < 26) return String.fromCharCode(index + a)
    const lower = index % 26
    const upper = index / 26
    return openName(upper) + String.fromCharCode(index + a)
}


function mergeOpen(a: TypeVariable, b: TypeVariable) {
    const al = a.link
    const bl = b.link
    const ab = al.binding
    const bb = bl.binding
    if (ab === bb) return // they are already merged.

    // Select the longest list's binding to keep. This ensures that
    // at most N operations (where N is the number of binding variables)
    // need to be performed to bind all binding variables together.
    let to = ab
    let ln = bl
    if (ab.len < bb.len) {
        to = bb
        ln = al
    }

    // Make all binding links point to the same binding.
    to.len = ab.len + bb.len
    ln.binding = to
    let n = ln.next
    while (n !== ln) {
        n.binding = to
        n = n.next
    }

    // Merge the lists together. In a circular list, swapping the next poniters merge
    // the list if they are different lists. The lists are ensured to be different as
    // if the variables were already bound together the .
    const an = al.next
    al.next = bl.next
    bl.next = an
}

function unify(a: Type, b: Type, start: number): Type {
    if (a === b) return a
    if (a.kind == TypeKind.Variable && a.link.binding.type) {
        a = a.link.binding.type
    }
    if (b.kind == TypeKind.Variable && b.link.binding.type) {
        b = b.link.binding.type
    }
    const aKind = a.kind
    const bKind = b.kind

    if (aKind == bKind) {
        switch (aKind) {
            case TypeKind.Boolean:
            case TypeKind.Int:
            case TypeKind.Float:
            case TypeKind.String:
            case TypeKind.Null:
                return a
            case TypeKind.Error:
                return mergeErrorTypes(a, b as ErrorType)
            case TypeKind.Lambda: {
                const aParameters = a.parameters
                const bParameters = (b as LambdaType).parameters
                const alen = aParameters.length
                const blen = bParameters.length
                const errors: ErrorType[] = []
                // Function arity must match.
                // TODO: Consider arity conversion to lowest
                if (alen != blen) {
                    return errorType(
                        start,
                        `Funtion arity mismatch, expected a function with ${alen} but received ${blen}`
                    )
                }

                // Parameter types must unify.
                // TODO: Consider variant paremters
                const parameters = unifyAll(aParameters, bParameters, start, errors)
                const result = unify(a.result, (b as LambdaType).result, start)
                if (result.kind == TypeKind.Error) errors.push(result)
                if (errors.length > 0) return mergeErrorTypes(...errors)
                return {
                    kind: TypeKind.Lambda,
                    parameters,
                    result
                }
            }
            case TypeKind.Record: {
                // Must match identically ignoring order
                // TODO: Consider sub-typing or or-typinging here
                const errors: ErrorType[] = []
                const o = b as RecordType
                const aMembers = a.members
                const bMembers = o.members
                const bScope = bMembers.reduce(
                    (map, value) => {
                        map.set(value.name, value.type)
                        return map
                    },
                    new Map<string, Type>()
                )
                const members: RecordTypeMember[] = []
                for (let i = 0; i < aMembers.length; i++) {
                    const aMember = aMembers[i]
                    const name = aMember.name
                    const bMemberType = bScope.get(name)
                    if (!bMemberType) {
                        // Consider better error message
                        errors.push(errorType(
                            start,
                            `Expected record type to contain a member named ${name}`
                        ))
                        continue
                    }
                    const type = unify(aMember.type, bMemberType, start)
                    members.push({ name, type })
                }
                if (errors.length > 0) return mergeErrorTypes(...errors)
                return { kind: TypeKind.Record, members }
            }
            case TypeKind.Array: {
                const o = b as ArrayType
                const element = unify(a.element, o.element, start)
                if (element.kind == TypeKind.Error) return element
                return { kind: TypeKind.Array, element }
            }
            case TypeKind.Variable: {
                mergeOpen(a, b as TypeVariable)
                return a
            }
        }
    }
    if (a.kind == TypeKind.Variable) {
        a.link.binding.type = b
        return b
    }
    if (b.kind == TypeKind.Variable) {
        b.link.binding.type = a
        return a
    }
    return errorType(start, `Expected a type ${typeToString(a)} but received ${typeToString(b)} `)
}

function unifyAll(a: Type[], b: Type[], start: number, errors: ErrorType[]): Type[] {
    assert(a.length == b.length)
    const result = a.map((a, index) => unify(a, b[index], start))
    errors.push(...result.filter(isErrorType))
    return result
}

function isErrorType(type: Type): type is ErrorType {
    return type.kind == TypeKind.Error
}

function errorType(start: number, message: string): ErrorType {
    return {
        kind: TypeKind.Error,
        messages: [{ start, message }]
    }
}

function mergeErrorTypes(...types: ErrorType[]): ErrorType {
    const messages: ErrorMessage[] = []
    const len = types.length
    if (len == 1) return types[0]
    const indexes = Array(len).fill(0)
    while (indexes.some((value, index) => value < types[index].messages.length)) {
        const lowestStart = Math.min(...indexes.map((value, index) => types[index].messages[value]?.start ?? Number.MAX_SAFE_INTEGER))
        const pushIndex = indexes.find((value, index) => types[index].messages[value].start == lowestStart)
        messages.push(types[pushIndex].messages[indexes[pushIndex]++])
    }
    return { kind: TypeKind.Error, messages }
}

function assert(value: boolean, msg?: string) {
    if (!value) throw Error(msg ?? 'Assertion failed')
}

export type TypeContext = Map<Expression, Type>

export interface CheckResult {
    readonly errors: ErrorMessage[]
    readonly context: TypeContext
    readonly type: Type
}

interface TypeScope {
    find(name: string): Type | undefined
    findNode(name: string): [Expression | undefined, TypeScope]
    enter(name: string, type: Type): void
    enterNode(name: string, node: Expression): void
    subScope(): TypeScope,
    letScope(): TypeScope
}

function emptyScope(): TypeScope {
    var scope: TypeScope = {
        find: (name: string) => undefined,
        findNode: (name: string) => [undefined, scope],
        enter: (name: string, type: Type) => { throw new Error('Enter in a root scope') },
        enterNode: (name: string, node: Expression) => { throw new Error('Enter in a root scope') },
        subScope: () => subScope(scope),
        letScope: () => letScope(scope)
    }

    return scope

    function subScope(parent: TypeScope): TypeScope {
        const types = new Map<string, Type>()
        const nodes = new Map<string, Expression>()
        var scope: TypeScope = {
            find: (name: string) => types.get(name) ?? parent.find(name),
            findNode: (name: string) => {
                const node = nodes.get(name)
                if (node) return [node, scope]
                return parent.findNode(name)
            },
            enter: (name: string, type: Type) => types.set(name, type),
            enterNode: (name: string, node: Expression) => nodes.set(name, node),
            subScope: () => subScope(scope),
            letScope: () => letScope(scope)
        }
        return scope
    }

    function letScope(parent: TypeScope): TypeScope {
        const delegate = parent.subScope()
        var scope: TypeScope = {
            find,
            findNode: delegate.findNode,
            enter: delegate.enter,
            enterNode: delegate.enterNode,
            subScope: () => subScope(scope),
            letScope: () => letScope(parent)
        }

        function find(name: string): Type | undefined {
            const found = delegate.find(name)
            if (found && found.kind == TypeKind.Lambda) {
                return freshOpens(found)
            }
            return found
        }
        return scope
    }
}

export function check(node: Expression, importer: (name: string) => Type): CheckResult {
    const checking = new Set<Expression>()
    const context: TypeContext = new Map<Expression, Type>()
    const errors: ErrorMessage[] = []

    const type = c(node, emptyScope())
    return { errors, context, type }

    function c(node: Expression, scope: TypeScope): Type {
        if (checking.has(node))
            return errorType(node.start, `Expression contains a recursive type reference`)
        let result = context.get(node)
        if (!result) {
            checking.add(node)
            result = simplify(ch(node, scope))
            enterErrors(result)
            context.set(node, result)
            checking.delete(node)
        }
        return result
    }

    function ch(node: Expression, scope: TypeScope): Type {
        switch (node.kind) {
            case NodeKind.Literal:
                switch (node.literal) {
                    case LiteralKind.Boolean: return booleanType
                    case LiteralKind.Float: return floatType
                    case LiteralKind.Int: return intType
                    case LiteralKind.String: return stringType
                    case LiteralKind.Null: return nullType
                }
            case NodeKind.Reference: {
                let type = scope.find(node.name)
                if (!type) {
                    const [referencedNode, referencedScope] = scope.findNode(node.name)
                    if (!referencedNode) return errorType(
                        node.start, `Reference '${node.name}' is not defined`
                    )
                    if (checking.has(referencedNode)) {
                        return errorType(
                            node.start, `Expression contains a recursive type reference`
                        )
                    }
                    return c(referencedNode, referencedScope)
                }
                return type
            }
            case NodeKind.Let: {
                const used = new Set<string>()
                const letScope = scope.letScope()
                node.bindings.forEach(binding => {
                    if (used.has(binding.name)) {
                        err(binding, `Duplicate declaration`)
                    }
                    used.add(binding.name)
                    letScope.enterNode(binding.name, binding.value)
                })
                node.bindings.forEach(binding => {
                    letScope.enter(binding.name, c(binding.value, letScope))
                })
                return c(node.body, letScope)
            }
            case NodeKind.Import:
                return importer(node.name)
            case NodeKind.Lambda: {
                const lambdaScope = scope.subScope()
                const parameters = node.parameters.map(parameter => {
                    const type = freshOpen()
                    lambdaScope.enter(parameter, type)
                    return type
                })
                const result = c(node.body, lambdaScope)
                return {
                    kind: TypeKind.Lambda,
                    parameters: simplifyAll(parameters),
                    result: simplify(result)
                }
            }
            case NodeKind.Call: {
                const target = c(node.target, scope)
                if (target.kind != TypeKind.Lambda)
                    return errorType(node.start, `Expected a function target`)
                const args = node.args.map(arg => c(arg, scope))
                if (args.length != target.parameters.length)
                    return errorType(node.start, `Incorrect number of arguments, expected ${target.parameters.length}, received ${node.args.length}`)
                for (let i = 0, len = args.length; i < len; i++) {
                    const argument = unify(args[i], target.parameters[i], node.args[i].start)
                    if (argument.kind == TypeKind.Error) return argument
                }
                return target.result
            }
            case NodeKind.Array: {
                let element: Type = freshOpen()
                for (let i = 0, len = node.values.length; i < len; i++) {
                    const value = node.values[i]
                    if (value.kind == NodeKind.Projection) {
                        const projected = c(value.value, scope)
                        if (projected.kind != TypeKind.Array) {
                            return errorType(value.value.start, `Expected an array`)
                        } else {
                            element = unify(element, projected.element, value.value.start)
                        }
                    } else {
                        element = unify(element, c(value, scope), value.start)
                    }
                }
                return { kind: TypeKind.Array, element }
            }
            case NodeKind.Record: {
                const members: RecordTypeMember[] = []
                const used = new Set<string>()
                const projections: Projection[] = []
                for (let i = 0, len = node.members.length; i < len; i++) {
                    const member = node.members[i]
                    if (member.kind == NodeKind.Projection) {
                        projections.push(member)
                    } else {
                        const name = member.name
                        if (used.has(name)) {
                            return errorType(node.start, `Duplicate field name`)
                        }
                        used.add(name)
                        const type = c(member.value, scope)
                        members.push({ name, type })
                    }
                }
                for (let i = 0, len = projections.length; i < len; i++) {
                    const projection = projections[i]
                    const projected = c(projection.value, scope)
                    if (projected.kind != TypeKind.Record) {
                        return errorType(projection.value.start, `Expected a record`)
                    }
                    const projectedMembers = projected.members
                    for (let j = 0, len = projectedMembers.length; j < len; j++) {
                        const projectedMember = projectedMembers[j]
                        const name = projectedMember.name
                        if (!used.has(name)) {
                            used.add(name)
                            const type = projectedMember.type
                            members.push({ name, type })
                        }
                    }
                }
                return { kind: TypeKind.Record, members }
            }
            case NodeKind.Select: {
                const target = c(node.target, scope)
                if (target.kind != TypeKind.Record) {
                    return errorType(node.target.start, `Expected a record`)
                }
                const name = node.name
                const member = target.members.find(m => m.name == name)
                if (!member) {
                    return errorType(node.start, `Member not found`)
                }
                return member.type
            }
            case NodeKind.Index: {
                const target = c(node.target, scope)
                if (target.kind != TypeKind.Array) {
                    return errorType(node.start, `Expected an array`)
                }
                return target.element
            }
            case NodeKind.Quote:
                return errorType(node.start, `Quote not supported yet`)
            case NodeKind.Splice:
                return errorType(node.start, `Splice not supported yet`)
            case NodeKind.Projection:
                return errorType(node.start, `Projected not supported here`)
            case NodeKind.Variable:
                return errorType(node.start, `Varaible not supported here`)
            case NodeKind.Match:
                return errorType(node.start, `Match not supported yet`)
        }
    }

    function err(node: { start: number}, message: string) {
        errors.push({
            start: node.start,
            message
        })
    }

    function enterErrors(type: Type) {
        switch (type.kind) {
            case TypeKind.Error: errors.push(...type.messages); break
            case TypeKind.Array: enterErrors(type.element); break
            case TypeKind.Lambda:
                type.parameters.forEach(enterErrors)
                enterErrors(type.result)
                break;
            case TypeKind.Record:
                type.members.forEach(m => enterErrors(m.type))
                break
        }
    }
}

function simplify(type: Type): Type {
    switch (type.kind) {
        case TypeKind.Array: {
            const element = simplify(type.element)
            if (type.element === element) return type
            return { kind: TypeKind.Array, element }
        }
        case TypeKind.Boolean:
        case TypeKind.Error:
        case TypeKind.Float:
        case TypeKind.Int:
        case TypeKind.Null:
        case TypeKind.String:
            return type
        case TypeKind.Lambda: {
            const parameters = simplifyAll(type.parameters)
            const result = simplify(type.result)
            if (parameters !== type.parameters || result !== type.result) {
                return { kind: TypeKind.Lambda, parameters, result }
            }
            return type
        }
        case TypeKind.Variable: {
            const boundType = type.link.binding.type
            if (boundType) return boundType
            return type
        }
        case TypeKind.Record: {
            let changed = false
            const members: RecordTypeMember[] = []
            type.members.forEach(member => {
                const type = simplify(member.type)
                if (type == member.type)
                    members.push(member)
                else {
                    changed = true
                    members.push({ name: member.name, type })
                }
            })
            if (changed) return { kind: TypeKind.Record, members }
            return type
        }
    }
}

function simplifyAll(types: Type[]): Type[] {
    let changed = false
    const result: Type[] = []
    types.forEach(type => {
        const newType = simplify(type)
        if (newType !== type) changed = true
        result.push(newType)
    })
    if (changed) return result
    return types
}