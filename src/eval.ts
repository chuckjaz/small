import { Array, Binding, Expression, Lambda, LiteralInt, LiteralKind, Member, NodeKind, Record } from "./ast";

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
                    members
                }
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
                return (rec.members.find(member => (member as Member).name == node.name) ?? error(`Undefined member: ${node.name}`)).value
            }
            case NodeKind.Index: {
                const target = array(e(scope, node.target))
                const index = int(e(scope, node.index))
                return target.values[index.value] as Expression ?? error("Index out of bound")
            }
        }
    }

    return e(emptyScope, expression)
 }


interface Scope {
    get(name: string): Expression
}

const emptyScope: Scope = {
    get: name => error(`Undefined symbol "${name}"`)
}

function scopeWith(parent: Scope, name: string, value: Expression): Scope {
    return {
        get:  lname => lname == name ? value : parent.get(name)
    }
}

function telescope(parent: Scope, bindings: Binding[], block: (scope: Scope, value: Expression) => Expression ): Scope {
    const map = new Map<string, Expression>()
    const scope: Scope = {
        get: name => map.get(name) ?? parent.get(name)
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
    return {
        get: name => map.get(name) ?? parent.get(name)
    }
}

function lambda(value: Expression): Lambda {
   return value.kind == NodeKind.Lambda ? value : error("Invalid: Expected a lambda")
}

function record(value: Expression): Record {
    return value.kind == NodeKind.Record ? value : error("Invalid: Expected a record")
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