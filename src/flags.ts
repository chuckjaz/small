interface Option<T extends string | number | boolean> {
    name: string
    description: string
    typeName: string
    alias?: string
    default?: T
    parse(option: string): T
}

function parseNumber(option: string): number {
    return Number(option)
}

function parseBoolean(option: string): boolean {
    switch (option.toLocaleLowerCase()) {
        case "":
        case "true":
        case "yes":
            return true
        case "false":
        case "no":
            return false
        default:
            throw new Error("Expected true or false")
    }
}

export class Flags {
    private optionDefs: Option<string | number | boolean>[] = []

    options: any = {}
    args: string[] = []
    unprocessed: string[] = []
    unknownOptions: string[] = []
    errors: string[] = []
    helpRequested: boolean = false

    int(name: string, description: string, dflt?: number, alias?: string) {
        this.optionDefs.push({ name, description, default: dflt, alias, parse: parseInt, typeName: 'int' })
    }

    number(name: string, description: string, dflt?: number, alias?: string) {
        this.optionDefs.push({ name, description, default: dflt, alias, parse: parseNumber, typeName: 'number' })
    }

    boolean(name: string, description: string, dflt?: boolean, alias?: string) {
        this.optionDefs.push({ name, description, default: dflt, alias, parse: parseBoolean, typeName: 'boolean' })
    }

    string(name: string, description: string, dflt?: string, alias?: string) {
        this.optionDefs.push({ name, description, default: dflt, alias, parse: option => option, typeName: 'string' })
    }

    parse(args: string[]): boolean {
        const optionMap = this.optionDefs.reduce((p, option) => {
            if (p.has(option.name)) throw new Error(`Duplicate option name: ${option.name}`)
            p.set(option.name, option)
            return p
        }, new Map<string, Option<any>>())
        const aliasMap = this.optionDefs.reduce((p, option) => {
            if (option.alias) {
                if (p.has(option.alias) || optionMap.has(option.alias)) {
                    throw new Error(`Duplicate option name: ${option.alias}`)
                }
                p.set(option.alias, option)
            }
            return p
        }, new Map<string, Option<any>>())
        for (let i = 0, len = args.length; i < len; i++) {
            const arg = args[i]
            if (arg == "--") {
                this.unprocessed = args.slice(i + 1)
                break
            }
            const opt = splitOption(arg)
            if (opt) {
                const [prefix, name, value] = opt
                if (name == "help" || name == "h" || name == "?") {
                    this.helpRequested = true
                    continue
                }
                if (prefix == "--") this.processArg(name, value, optionMap, arg)
                else this.processArg(name, value, aliasMap, arg)
            } else {
                if (arg.startsWith("-")) {
                    this.unknownOptions.push(arg)
                } else {
                    this.args.push(arg)
                }
            }
        }
        for (const option of this.optionDefs) {
            if (option.default !== undefined && !(option.name in this.options)) {
                this.options[option.name] = option.default
            }
        }
        return this.errors.length == 0 && this.unknownOptions.length == 0
    }

    report(allowedUnprocessed: boolean = false): boolean {
        if (this.errors.length > 0) {
            console.log(this.errors.join('\n'), "\n")
            return false
        }
        if (this.unknownOptions.length > 0) {
            console.log(`Unknown option${this.unknownOptions.length == 1 ? '' : 's'}: ${
                this.unknownOptions.join(", ")
            }\n`)
            return false
        }
        if (!allowedUnprocessed && this.unprocessed.length > 0) {
            console.log("-- separator not supported\n")
            return false
        }
        return true
    }

    private processArg(name: string, value: string, defs: Map<string, Option<any>>, original: string) {
        if (name in this.options) {
            this.errors.push(`Duplicate option specified: ${name}`)
        } else {
            const option = defs.get(name)
            if (option) {
                try {
                    this.options[option.name] = option.parse(value)
                } catch (e: any) {
                    this.errors.push(`Error parsing option: ${e.message}`)
                }
            } else {
                this.unknownOptions.push(original)
            }
        }

    }

    helpText(): string {
        let width: number = 0
        const optionDefs = this.optionDefs.slice(0).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
        for (const option of optionDefs) {
            const optionWidth = 3 + option.name.length + (option.alias ? option.alias.length + 3: 0)
            width = Math.max(width, optionWidth)

        }
        let result = ""
        for (const option of optionDefs) {
            const optionText = option.alias ? `--${option.name}, -${option.alias}:` : `--${option.name}:`
            result += `${padding(width - optionText.length)}${optionText} ${option.description}\n`
            result += `${padding(width - 5)}type: ${option.typeName}\n`
            if (option.default !== undefined) {
                result += `${padding(width - 8)}default: ${option.default}\n`
            }
            result += '\n'
        }
        return result
    }
}

function splitOption(option: string): [string, string, string] | undefined {
    const result: [string, string, string] = ['', '', '']
    let rest = option
    if (option.startsWith("--")) {
        rest = option.substring(2)
        result[0] = "--"
    } else if (option.startsWith("-")) {
        rest = option.substring(1)
        result[0] = "-"
    } else return undefined
    const equalPos = rest.indexOf('=')
    if (equalPos >= 0) {
        const spacePos = rest.indexOf(' ')
        if (equalPos < spacePos) {
            return undefined
        }
        result[1] = rest.substring(0, equalPos)
        result[2] = rest.substring(equalPos + 1)
    } else {
        result[1] = rest
    }
    return result
}

function padding(value: number): string {
    switch (value) {
        case 0: return ""
        case 1: return " "
        case 2: return "  "
        case 3: return "   "
        case 4: return "    "
    }
    const n = value >> 1
    return padding(n) + padding(n) + (value & 1 ? " " : "")
}
