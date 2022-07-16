import { Token } from "./token"

export class Lexer {
    text: string
    start = 0
    end = 0
    line = 1
    lineStart = 0
    value: any = null

    constructor(text: string) {
        this.text = text
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
                    this.lineStart = this.start
                    this.line++
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
                            case "z": case "_":
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
                        case "let": result = Token.Let; break
                        case "in": result = Token.In; break
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
                case '"':
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
                            default:
                                i++
                                continue     
                        }
                        break
                    }
                    this.value = text.substring(this.start + 1, i - 1)
                    result = Token.String
                    break
                case ".":
                    result = Token.Dot
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
            }
            break
        }
        this.end = i
        return result
    }
}