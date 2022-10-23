import { fileSet, Position } from "./files"

describe("files", () => {
    it("can create a file set", () => {
        const set = fileSet()
        expect(set).not.toBeUndefined()
    })
    it("can create a file", () => {
        const set = fileSet()
        const fileBuilder = set.declare("name", 100)
        const file = fileBuilder.build()
        expect(file).not.toBeUndefined()
    })
    it("can add lines to a file", () => {
        const set = fileSet()
        const ab = set.declare("a", 1000)
            .addLine(10)
            .addLine(20)
        const a = ab.build()
        validatePosition(a.position({ start: ab.pos(5) }), "a", 1, 6)
        validatePosition(a.position({ start: ab.pos(7) }), "a", 1, 8)
        validatePosition(a.position({ start: ab.pos(20) }), "a", 3, 1)
        validatePosition(a.position({ start: ab.pos(25) }), "a", 3, 6)
    })
    it("find files based on location", () => {
        const set = fileSet()
        const ab = set.declare("a", 1000)
        const ap = ab.pos(10)
        const a = ab.build()
        const bb = set.declare("b", 2000)
        const bp = bb.pos(10)
        const b = bb.build()

        expect(set.file({ start: ap })).toBe(a)
        expect(set.file({ start: bp })).toBe(b)
    })
    it("can convert a location to position", () => {
        const set = fileSet()
        const ab = set.declare("a", 1000)
        const ap = ab.pos(10)
        ab.build()
        const bb = set.declare("b", 2000)
        const bp = bb.pos(10)
        bb.build()

        validatePosition(set.position({ start: ap }), "a", 1, 11)
        validatePosition(set.position({ start: bp }), "b", 1, 11)
    })
    it("can convert a position to string", () => {
        const set = fileSet()
        const ab = set.declare("a", 1000)
        const ap = ab.pos(10)
        ab.build()
        const p = set.position({ start: ap })
        expect(p?.display()).toEqual("a:1:11")
    })
})

function validatePosition(position: Position | undefined, fileName: string, line: number, column: number) {
    if (!position) throw Error("Expected a position")
    expect(position.fileName).toEqual(fileName)
    expect(position.line).toEqual(line)
    expect(position.column).toEqual(column)
}
