import { Array, Binding, Expression, Lambda, Literal, LiteralInt, LiteralKind, Member, NodeKind, Projection, Record, Reference } from "./ast";

export function evaluate(expression: Expression): Expression {

    function e(scope: Scope, node: Expression): Expression {
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
                const memberMap = new Map<string, Expression>()
                node.members.forEach(member => {
                    if (member.kind == NodeKind.Projection) {
                        const value = record(e(scope, member.value));
                        (value.members as Member[]).forEach(m => { memberMap.set(m.name, m.value) })
                    } else {
                        memberMap.set(member.name, e(scope, member.value))
                    }
                })
                const members: Member[] = []
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
                } as Record
            }
            case NodeKind.Array: {
                const values: Expression[] = []
                for (const value of node.values) {
                    if (value.kind == NodeKind.Projection) {
                        const a = array(e(scope, value.value))
                        values.push(...a.values as Expression[])
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
                return target.values[index.value] as Expression ?? error("Index out of bound")
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

    function reduce(scope: Scope, value: Expression): Expression {
        return e({
            get: name => scope.has(name) ? scope.get(name) : r(name),
            has: scope.has
        }, value)
    }

    function r(name: string): Reference { return { kind: NodeKind.Reference, name }}

    function matches(scope: Scope, pattern: Expression, value: Expression): Scope | undefined {
        const map = new Map<string, Expression>()

        function match(p: Expression, v: Expression): boolean {
            if (p.kind == v.kind) {
                switch (p.kind) {
                    case NodeKind.Literal: return p.value == (v as Literal).value
                    case NodeKind.Reference: return false
                    case NodeKind.Let: error("Let cannot be in a pattern")
                    case NodeKind.Lambda: error("Lambda cannot be in a pattern")
                    case NodeKind.Call: error("Call cannot be in a pattern")
                    case NodeKind.Index: error("Index operator cannot be in pattern")
                    case NodeKind.Select: error("Selection operator cannot be in a pattern")
                    case NodeKind.Match: error("Match cannot be in a pattern")
                    case NodeKind.Array:
                        const pa = p.values
                        const ar = (v as Array).values as Expression[]
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
                            const projected: Array = {
                                kind: NodeKind.Array,
                                values
                            }
                            const projection = pa[projectIndex] as Projection
                            return match(projection.value, projected)
                        }
                        return true
                    case NodeKind.Record: {
                        const rec = record(v)
                        const map = rec.map
                        let seen = new Set<string>()
                        let projection: Projection | undefined = undefined
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
                            // Bind projection
                            const boundRecord: Record = {
                                kind: NodeKind.Record,
                                members: rec.members.filter(m => m.kind == NodeKind.Member && !seen.has(m.name))
                            }
                            return match(projection.value, boundRecord)
                        }
                        return true
                    }
                }
            } else {
                if (p.kind == NodeKind.Reference) {
                    const current = map.get(p.name)
                    if (current) {
                        return match(current, v)
                    }
                    map.set(p.name, v)
                    return true
                }
                return false
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
    get(name: string): Expression
    has(name: string): boolean
}

const emptyScope: Scope = {
    get: name => error(`Undefined symbol "${name}"`),
    has: name => false
}

function telescope(parent: Scope, bindings: Binding[], block: (scope: Scope, value: Expression) => Expression ): Scope {
    const map = new Map<string, Expression>()
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

function scopeOf(parent: Scope, names: string[], values: Expression[]): Scope {
    const map = new Map<string, Expression>()
    for (let i = 0; i < names.length; i++) {
        map.set(names[i], values[i])
    }
    return scopeFromMap(parent, map)
}

function scopeFromMap(parent: Scope, map: Map<string, Expression>): Scope {
    return {
        get: name => map.get(name) ?? parent.get(name),
        has: name => map.has(name) || parent.has(name)
    }
}

function lambda(value: Expression): Lambda {
   return value.kind == NodeKind.Lambda ? value : error("Invalid: Expected a lambda")
}

interface RuntimeRecord extends Record {
    map: Map<string, Expression>
}

function record(value: Expression): RuntimeRecord {
    const rec: RuntimeRecord = value.kind == NodeKind.Record ? value as RuntimeRecord : error("Invalid: Expected a record")
    if ('map' in rec) {
        return rec as RuntimeRecord
    }
    const map = new Map<string, Expression>()
    for (const memberP of rec.members) {
        const member = memberP as Member
        map.set(member.name, member.value)
    }
    rec.map = map
    return rec
}

function array(value: Expression): Array {
    return value.kind == NodeKind.Array ? value : error("Invalid: Expected an array")
}

function int(value: Expression): LiteralInt {
    return value.kind == NodeKind.Literal && value.literal == LiteralKind.Int ? value : error("Expected an integer")
}

function error(message: string): never {
    throw Error(message)
}
