import { Array, Binding, Expression, Lambda, Literal, LiteralInt, LiteralKind, Member, NodeKind, Pattern, Projection, Record, Reference, Variable } from "./ast";

export function evaluate(expression: Expression): Value {

    function e(scope: Scope, node: Expression): Value {
        switch (node.kind) {
            case NodeKind.Literal:
                return node
            case NodeKind.Reference:
                return scope.get(node.name)
            case NodeKind.Let:
                return e(telescope(scope, node.bindings, e), node.body)
            case NodeKind.Lambda:
                return node
            case NodeKind.Call: {
                const args = node.args.map(node => e(scope, node))
                const target = lambda(e(scope, node.target))
                const newScope = scopeOf(scope, target.parameters, args)
                return e(newScope, target.body)
            }
            case NodeKind.Record: {
                const memberMap = new Map<string, Value>()
                node.members.forEach(member => {
                    if (member.kind == NodeKind.Projection) {
                        const value = record(e(scope, member.value));
                        value.members.forEach(m => { memberMap.set(m.name, m.value) })
                    } else {
                        memberMap.set(member.name, e(scope, member.value))
                    }
                })
                const members: Member<Value>[] = []
                for (const [name, value] of memberMap) {
                    members.push({
                        kind: NodeKind.Member,
                        name,
                        value
                    })
                }
                return {
                    kind: NodeKind.Record,
                    members,
                    map: memberMap
                } as RuntimeRecord
            }
            case NodeKind.Array: {
                const values: Value[] = []
                for (const value of node.values) {
                    if (value.kind == NodeKind.Projection) {
                        const a = array(e(scope, value.value))
                        values.push(...a.values as Value[])
                    } else {
                        values.push(e(scope, value))
                    }
                }
                return {
                    kind: NodeKind.Array,
                    values
                }
            }
            case NodeKind.Select: {
                const rec = record(e(scope, node.target))
                return (rec.map.get(node.name) ?? error(`Undefined member: ${node.name}`))
            }
            case NodeKind.Index: {
                const target = array(e(scope, node.target))
                const index = int(e(scope, node.index))
                return target.values[index.value] ?? error("Index out of bound")
            }
            case NodeKind.Match: {
                const target = e(scope, node.target)
                for (const clause of node.clauses) {
                    const valueScope = matches(scope, clause.pattern, target)
                    if (valueScope) {
                        return e(valueScope, clause.value)
                    }
                }
                error("No matching match clause found")
            }
        }
    }

    function matches(scope: Scope, pattern: Expression | Variable | Pattern, value: Value): Scope | undefined {
        const map = new Map<string, Value>()

        function match(p: Expression | Pattern | Variable, v: Value): boolean {
            switch (p.kind) {
                case NodeKind.Variable: {
                    const previous = map.get(p.name)
                    map.set(p.name, v)
                    return !previous || eq(v, previous)
                }
                case NodeKind.Literal: return eq(p, v)
                case NodeKind.Reference:
                case NodeKind.Let:
                case NodeKind.Lambda:
                case NodeKind.Call:
                case NodeKind.Index:
                case NodeKind.Select:
                case NodeKind.Match:
                case NodeKind.Array:
                case NodeKind.Record:
                    return eq(e(scope, p), v)
                case NodeKind.Pattern:
                    return matchPattern(p, v)
            }
        }

        function matchPattern(pattern: Pattern, v: Value): boolean {
            const p = pattern.pattern
            switch (p.kind) {
                case NodeKind.Array:
                    const pa = p.values
                    if (v.kind != NodeKind.Array) return false
                    const ar = v.values
                    let projectIndex = -1
                    for (let i = 0; i < pa.length; i++) {
                        const pat = pa[i]
                        if (pat.kind == NodeKind.Projection) {
                            projectIndex = i;
                            break
                        }
                        if (i >= ar.length || !match(pat, ar[i])) return false
                    }
                    if (projectIndex >= 0) {
                        for (let i = ar.length - 1, j = pa.length - 1; j > projectIndex; j--, i--) {
                            const pat = pa[j]
                            if (pat.kind == NodeKind.Projection) {
                                error("Only one array projection allowed in a pattern")
                            }
                            if (!match(pat, ar[i])) return false
                        }
                        const values = ar.slice(projectIndex, ar.length - (pa.length - (projectIndex + 1)))
                        const projected: Array<Value> = {
                            kind: NodeKind.Array,
                            values
                        }
                        const projection = pa[projectIndex] as Projection<Pattern>
                        return match(projection.value, projected)
                    }
                    return true
                case NodeKind.Record: {
                    if (v.kind != NodeKind.Record) return false
                    const map = v.map
                    let seen = new Set<string>()
                    let projection: Projection<Pattern | Variable> | undefined = undefined
                    for (const memberOrProjection of p.members) {
                        if (memberOrProjection.kind == NodeKind.Projection) {
                            if (projection) {
                                error("Only one member projection allowed in a pattern")
                            }
                            projection = memberOrProjection
                        } else {
                            const value = map.get(memberOrProjection.name)
                            if (!value || !match(memberOrProjection.value, value)) return false
                            seen.add(memberOrProjection.name)
                        }
                    }
                    if (projection) {
                        const members = v.members.filter(m => m.kind == NodeKind.Member && !seen.has(m.name))
                        const map = new Map<string, Value>()
                        members.forEach(m => map.set(m.name, m.value))
                        // Bind projection
                        const boundRecord: RuntimeRecord = {
                            kind: NodeKind.Record,
                            members,
                            map
                        }

                        return match(projection.value, boundRecord)
                    }
                    return true
                }
            }
        }

        const doesMatch = match(pattern, value)
        if (doesMatch) {
            if (map.size > 0)
                return scopeFromMap(scope, map)
            return scope
        }
        return undefined
    }

    return e(emptyScope, expression)
 }


interface Scope {
    get(name: string): Value
    has(name: string): boolean
}

const emptyScope: Scope = {
    get: name => error(`Undefined symbol "${name}"`),
    has: name => false
}

function telescope(parent: Scope, bindings: Binding[], block: (scope: Scope, value: Expression) => Value): Scope {
    const map = new Map<string, Value>()
    const scope: Scope = {
        get: name => map.get(name) ?? parent.get(name),
        has: name => map.has(name) || parent.has(name)
    }
    for (const binding of bindings) {
        const value = block(scope, binding.value)
        map.set(binding.name, value)
    }
    return scope
}

function scopeOf(parent: Scope, names: string[], values: Value[]): Scope {
    const map = new Map<string, Value>()
    for (let i = 0; i < names.length; i++) {
        map.set(names[i], values[i])
    }
    return scopeFromMap(parent, map)
}

function scopeFromMap(parent: Scope, map: Map<string, Value>): Scope {
    return {
        get: name => map.get(name) ?? parent.get(name),
        has: name => map.has(name) || parent.has(name)
    }
}

function lambda(value: Value): Lambda {
   return value.kind == NodeKind.Lambda ? value : error("Invalid: Expected a lambda")
}

export type Value =
    Literal |
    RuntimeRecord |
    Array<Value> |
    Lambda

export interface RuntimeRecord extends Record<Member<Value>> {
    map: Map<string, Value>
}

export function eq(a: Value, b: Value): boolean {
    if (a === b) return true
    if (a.kind == b.kind) {
        switch (a.kind) {
            case NodeKind.Literal: return a.value === (b as Literal).value
            case NodeKind.Record: {
                const bp = b as RuntimeRecord
                if (bp.members.length != a.members.length) return false
                return a.members.every(aMember => {
                    const bMemberValue = bp.map.get(aMember.name)
                    return bMemberValue && eq(aMember.value, bMemberValue)
                })
            }
            case NodeKind.Array: {
                const bp = b as Array<Value>
                return a.values.length == bp.values.length && a.values.every((av, i) => eq(av, bp.values[i]))
            }
        }
    }
    return false
}

function record(value: Value): RuntimeRecord {
    const rec: RuntimeRecord = value.kind == NodeKind.Record ? value as RuntimeRecord : error("Invalid: Expected a record")
    if ('map' in rec) {
        return rec as RuntimeRecord
    }
    const map = new Map<string, Value>()
    for (const memberP of rec.members) {
        const member = memberP as Member<Value>
        map.set(member.name, member.value)
    }
    rec.map = map
    return rec
}

function array(value: Value): Array<Value> {
    return value.kind == NodeKind.Array ? value : error("Invalid: Expected an array")
}

function int(value: Value): LiteralInt {
    return value.kind == NodeKind.Literal && value.literal == LiteralKind.Int ? value : error("Expected an integer")
}

function error(message: string): never {
    throw Error(message)
}
