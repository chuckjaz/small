import { Array, Expression, Lambda, LiteralInt, LiteralKind, NodeKind, Record } from "./ast";

export function evaluate(expression: Expression): Expression {

    function e(scope: Scope, node: Expression): Expression {
        switch (node.kind) {
            case NodeKind.Literal: 
                return node
            case NodeKind.Reference: 
                return scope.get(node.name)
            case NodeKind.Let: 
                return e(scopeWith(scope, node.name, e(scope, node.value)), node.body)
            case NodeKind.Lambda: 
                return node
            case NodeKind.Call: {
                const args = node.args.map(node => e(scope, node))
                const target = lambda(e(scope, node.target))
                const newScope = scopeOf(scope, target.parameters, args)
                return e(newScope, target.body)
            }
            case NodeKind.Record: {
                return {
                    kind: NodeKind.Record,
                    members: node.members.map(member => ({
                        kind: NodeKind.Member,
                        name: member.name,
                        value: e(scope, member.value)
                    }))
                }
            }
            case NodeKind.Array: {
                return {
                    kind: NodeKind.Array,
                    values: node.values.map(value => e(scope, value))
                }
            }
            case NodeKind.Select: {
                const rec = record(e(scope, node.target))
                return (rec.members.find(member => member.name == node.name) ?? error(`Undefined member: ${node.name}`)).value
            }
            case NodeKind.Index: {
                const target = array(e(scope, node.target))
                const index = int(e(scope, node.index))
                return target.values[index.value] ?? error("Index out of bound")
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