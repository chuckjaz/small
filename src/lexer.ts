import { FileBuilder } from "./files"
import { Token } from "./token"

export class Lexer {
    text: string
    start = 0
    end = 0
    line = 1
    lineStart = 0
    value: any = null
    private builder?: FileBuilder

    constructor(text: string, builder?: FileBuilder) {
        this.text = text
        this.builder = builder
    }

    get position() {
        const builder = this.builder
        const start = this.start
        return builder != null ? builder.pos(start) : start
     }

    next(): Token {
        const text = this.text
        let i = this.end
        let result = Token.EOF

        loop: while(true) {
            const c = text[i]
            this.start = i++
            switch (c) {
                case undefined:
                    i--
                    break loop
                case " ": case "\t":
                    continue
                case "\r":
                    if (text[i] == "\n") i++
                    // fallthrough
                case "\n":
                    this.lineStart = i
                    this.line++
                    this.builder?.addLine(i)
                    continue
                case "A": case "B": case "C": case "D": case "E":
                case "F": case "G": case "H": case "I": case "J":
                case "K": case "L": case "M": case "N": case "O":
                case "P": case "Q": case "R": case "S": case "T":
                case "U": case "V": case "W": case "X": case "Y":
                case "Z":
                case "a": case "b": case "c": case "d": case "e":
                case "f": case "g": case "h": case "i": case "j":
                case "k": case "l": case "m": case "n": case "o":
                case "p": case "q": case "r": case "s": case "t":
                case "u": case "v": case "w": case "x": case "y":
                case "z": case "_": {
                    while (true) {
                        switch(text[i]) {
                            case "A": case "B": case "C": case "D": case "E":
                            case "F": case "G": case "H": case "I": case "J":
                            case "K": case "L": case "M": case "N": case "O":
                            case "P": case "Q": case "R": case "S": case "T":
                            case "U": case "V": case "W": case "X": case "Y":
                            case "Z":
                            case "a": case "b": case "c": case "d": case "e":
                            case "f": case "g": case "h": case "i": case "j":
                            case "k": case "l": case "m": case "n": case "o":
                            case "p": case "q": case "r": case "s": case "t":
                            case "u": case "v": case "w": case "x": case "y":
                            case "z": case "_": case "!":
                            case "0": case "1": case "2": case "3": case "4":
                            case "5": case "6": case "7": case "8": case "9":
                                i++
                                continue

                        }
                        break
                    }
                    result = Token.Identifier
                    const ident = text.substring(this.start, i)
                    switch (ident) {
                        case "false": result = Token.False; break
                        case "in": result = Token.In; break
                        case "let": result = Token.Let; break
                        case "match": result = Token.Match; break
                        case "null": result = Token.Null; break
                        case "true": result = Token.True; break
                    }
                    this.value = ident
                    break
                }
                case "-":
                case "0": case "1": case "2": case "3": case "4":
                case "5": case "6": case "7": case "8": case "9": {
                    let isInt = true
                    while (true) {
                        switch(text[i]) {
                            case ".": case "E": case "e": case "+": case "-":
                                isInt = false
                                // fallthrough
                            case "0": case "1": case "2": case "3": case "4":
                            case "5": case "6": case "7": case "8": case "9":
                                i++
                                continue
                        }
                        break
                    }
                    this.value = parseFloat(text.substring(this.start, i))
                    result = isInt ? Token.Integer : Token.Float
                    break
                }
                case '"': {
                    let strValue = ""
                    let last = this.start + 1
                    function shift(i: number) {
                        if (last < i)
                            strValue = strValue + text.substring(last, i)
                        last = i
                    }
                    while (true) {
                        switch (text[i]) {
                            case '"':
                                i++
                                break
                            case "\n":
                            case "\r":
                            case undefined:
                                i--
                                result = Token.Error
                                break loop
                            case "\\":
                                shift(i)
                                switch (text[i + 1]) {
                                    case "r": strValue += "\r"; break
                                    case "n": strValue += "\n"; break
                                    case "\"": strValue += "\""; break
                                    case "\\": strValue += "\\"; break
                                    case "t": strValue += "\t"; break
                                    default:
                                        result = Token.Error
                                        break loop
                                }
                                i += 2
                                last = i
                                continue
                            default:
                                i++
                                continue
                        }
                        break
                    }
                    shift(i - 1)
                    this.value = strValue
                    result = Token.String
                    break
                }
                case ".":
                    if (text[i] == "." && text[i+1] == ".") {
                        i += 2
                        result = Token.Project
                    } else {
                        result = Token.Dot
                    }
                    break
                case "(":
                    result = Token.LParen
                    break
                case ")":
                    result = Token.RParen
                    break
                case "[":
                    result = Token.LBrack
                    break
                case "]":
                    result = Token.RBrack
                    break
                case "{":
                    result = Token.LBrace
                    break
                case "}":
                    result = Token.RBrace
                    break
                case "/":
                    result = Token.Lambda
                    break
                case ",":
                    result = Token.Comma
                    break
                case ":":
                    result = Token.Colon
                    break
                case "=":
                    result = Token.Equal
                    break
                case "$":
                    result = Token.Dollar
                    break
                case "'":
                    result = Token.Quote
                    break
                case "#":
                    result = Token.Hash
                    break
            }
            break
        }
        this.end = i
        return result
    }
}