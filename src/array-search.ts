export function search<K, T>(arr: T[], key: K, compare: (a: K, b: K) => number, keyOf: (a: T) => K): number {
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

export function searchNum(arr: number[], value: number): number {
    let start = 0
    let end = arr.length - 1
    while (start <= end) {
        const mid = (start + end) >> 1
        const v = arr[mid]
        if (value > v) {
            start = mid + 1
        } else if (value < v) {
            end = mid - 1
        } else {
            return mid
        }
    }
    return -start - 1
}
