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
}

export interface FileSet {
    file(locaton: Location): File | undefined
    position(location: Location): Position | undefined    
}

export interface FileBuilder {
    addLine(offset: number): FileBuilder
    pos(offset: number): number
    build(): File
}

export interface FileSetBuilder {
    file(fileName: string, size: number): FileBuilder
    build(): FileSet
}

export function fileSetBuilder(): FileSetBuilder {
    return new FileSetBuilderImpl()
}

class FileSetBuilderImpl implements FileSetBuilder {
    private lastBase = 1
    private bases: number[] = []
    files: FileImpl[] = []
    
    file(fileName: string, size: number): FileBuilder {
        const base = this.lastBase
        this.lastBase += size
        return new FileBuilderImpl(fileName, base, size, this)
    }

    build(): FileSet {
        return new FileSetImpl(this.files)
    }
}

class FileBuilderImpl implements FileBuilder {
    fileName: string
    base: number
    size: number
    lines: number[] = [0]
    fileBuilder: FileSetBuilderImpl

    constructor(fileName: string, base: number, size: number, builder: FileSetBuilderImpl) {
        this.fileName = fileName
        this.base = base
        this.size = size
        this.fileBuilder = builder
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
        insert(this.fileBuilder.files, file, fileCompare)
        return file
    }
}

class FileSetImpl implements FileSet {
    private files: FileImpl[]
    
    constructor(files: FileImpl[]) {
        this.files = files
    }

    file(location: Location): File | undefined {
        const index = search(this.files, location.start, numberCompare, keyOfFile)
        const fileIndex = index < 0 ? -index - 2 : index
        return this.files[fileIndex]
    }

    position(location: Location): Position | undefined {
        return this.file(location)?.position(location)
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

    position(location: Location): Position | undefined {
        const offset = location.start - this.base
        if (offset < 0 || offset > this.size) return undefined
        const index = search(this.lines, offset, numberCompare, identity)
        const lineOffset = index < 0 ? -index - 2 : index
        const columnOffset = offset - this.lines[lineOffset]
        return new PositionImpl(this.fileName, lineOffset + 1, columnOffset + 1)
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

function search<K, T>(arr: T[], key: K, compare: (a: K, b: K) => number, keyOf: (a: T) => K): number {
    let start = 0
    let end = arr.length - 1
    while (start <= end) {
        const mid = (start + end) >> 1
        const v = arr[mid]
        const result = compare(key, keyOf(v))
        if (result > 0) {
            start = mid + 1
        } else if (result < 0) {
            end = mid - 1
        } else {
            return mid
        }
    }
    return -start - 1
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