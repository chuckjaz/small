import { search } from './array-search'

export interface Location {
    readonly start: number
}

export interface Position {
    readonly fileName: string
    readonly column: number
    readonly line: number
    display(): string
}

export interface File {
    readonly fileName: string
    readonly size: number
    position(location: Location): Position | undefined
    pos(offset: number): number
    lineRange(line: number): { start: number, end: number }
}

export interface FileSet {
    declare(fileName: string, size: number): FileBuilder
    file(locaton: Location): File | undefined
    find(fileName: string): File | undefined
    position(location: Location): Position | undefined
}

export interface FileBuilder {
    addLine(offset: number): FileBuilder
    pos(offset: number): number
    build(): File
}

export function fileSet(): FileSet {
    return new FileSetImpl()
}

class FileSetImpl implements FileSet {
    private lastBase = 1
    private bases: number[] = []
    files: FileImpl[] = []

    declare(fileName: string, size: number): FileBuilder {
        const base = this.lastBase
        this.lastBase += size
        return new FileBuilderImpl(fileName, base, size, this)
    }

    file(location: Location): File | undefined {
        const index = search(this.files, location.start, numberCompare, keyOfFile)
        const fileIndex = index < 0 ? -index - 2 : index
        return this.files[fileIndex]
    }

    find(fileName: string): File | undefined {
        for (const file of this.files) {
            if (file.fileName == fileName) return file
        }
        return undefined
    }

    position(location: Location): Position | undefined {
        return this.file(location)?.position(location)
    }
}

class FileBuilderImpl implements FileBuilder {
    fileName: string
    base: number
    size: number
    lines: number[] = [0]
    fileSet: FileSetImpl

    constructor(fileName: string, base: number, size: number, fileSet: FileSetImpl) {
        this.fileName = fileName
        this.base = base
        this.size = size
        this.fileSet = fileSet
    }

    addLine(offset: number): FileBuilder {
        insert(this.lines, offset, numberCompare)
        return this
    }

    pos(offset: number): number {
        return this.base + offset
    }

    build(): File {
        const file = new FileImpl(this.fileName, this.base, this.size, this.lines)
        insert(this.fileSet.files, file, fileCompare)
        return file
    }
}

class FileImpl implements File {
    fileName: string
    size: number
    base: number
    private lines: number[]

    constructor(fileName: string, base: number, size: number, lines: number[]) {
        this.fileName = fileName
        this.base = base
        this.size = size
        this.lines = lines
    }

    pos(offset: number): number {
        return this.base + offset
    }

    position(location: Location): Position | undefined {
        const offset = location.start - this.base
        if (offset < 0 || offset > this.size) return undefined
        const index = search(this.lines, offset, numberCompare, identity)
        const lineOffset = index < 0 ? -index - 2 : index
        const columnOffset = offset - this.lines[lineOffset]
        return new PositionImpl(this.fileName, lineOffset + 1, columnOffset + 1)
    }

    lineRange(line: number): { start: number, end: number } {
        if (line > 0 && line < this.lines.length)
            return { start: this.lines[line - 1], end: this.lines[line] }
        return { start: 0, end: 0 }
    }
}

class PositionImpl implements Position {
    fileName: string
    line: number
    column: number

    constructor(fileName: string, line: number, column: number) {
        this.fileName = fileName
        this.line = line
        this.column = column
    }

    display(): string {
        return `${this.fileName}:${this.line}:${this.column}`
    }
}

function numberCompare(a: number, b: number) {
    return a - b
}

function fileCompare(a: FileImpl, b: FileImpl): number {
    return a.base - b.base
}

function identity<T>(a: T): T {
    return a
}

function keyOfFile(file: FileImpl): number {
    return file.base
}

function insert<T>(arr: T[], value: T, compare: (a: T, b: T) => number) {
    const len = arr.length
    if (len == 0) arr.push(value)
    else {
        if (compare(value, arr[len - 1]) > 0) arr.push(value)
        else {
            const index = search(arr, value, compare, identity)
            if (index < 0) {
                const insertIndex = -index - 1
                arr.splice(insertIndex, 0, value)
            }
        }
    }
}