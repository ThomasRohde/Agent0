/**
 * A0 stdlib: list operations
 * len, append, concat, sort, filter, find, range, join
 */
import { isTruthy } from "@a0/core";
import type { StdlibFn, A0Record, A0Value } from "@a0/core";

function deepEqual(a: A0Value, b: A0Value): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i] ?? null, b[i] ?? null)) return false;
    }
    return true;
  }

  if (typeof a === "object" && typeof b === "object") {
    const aRec = a as A0Record;
    const bRec = b as A0Record;
    const aKeys = Object.keys(aRec);
    const bKeys = Object.keys(bRec);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bRec, key)) return false;
      if (!deepEqual(aRec[key] ?? null, bRec[key] ?? null)) return false;
    }
    return true;
  }

  return false;
}

/**
 * len { in: list|str|rec } -> int
 * Returns the length of a list, string, or record (number of keys).
 */
export const lenFn: StdlibFn = {
  name: "len",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    if (Array.isArray(input)) return input.length;
    if (typeof input === "string") return input.length;
    if (input !== null && typeof input === "object" && !Array.isArray(input)) {
      return Object.keys(input as A0Record).length;
    }
    throw new Error("len: 'in' must be a list, string, or record");
  },
};

/**
 * append { in: list, value: any } -> list
 * Returns a new list with value appended.
 */
export const appendFn: StdlibFn = {
  name: "append",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    const value = args["value"] ?? null;
    if (!Array.isArray(input)) {
      throw new Error("append: 'in' must be a list");
    }
    return [...input, value];
  },
};

/**
 * concat { a: list, b: list } -> list
 * Concatenates two lists.
 */
export const concatFn: StdlibFn = {
  name: "concat",
  execute(args: A0Record): A0Value {
    const a = args["a"] ?? null;
    const b = args["b"] ?? null;
    if (!Array.isArray(a) || !Array.isArray(b)) {
      throw new Error("concat: 'a' and 'b' must be lists");
    }
    return [...a, ...b];
  },
};

/**
 * sort { in: list, by?: str | list } -> list
 * Returns a new sorted list. Natural sort: numbers numeric, strings lexicographic.
 * If `by` is a string, sorts by that record key.
 * If `by` is a list of strings, sorts by multiple keys (first key is primary).
 */
export const sortFn: StdlibFn = {
  name: "sort",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    const by = args["by"] ?? null;
    if (!Array.isArray(input)) {
      throw new Error("sort: 'in' must be a list");
    }
    // Normalize by to string[] | null
    let keys: string[] | null = null;
    if (by !== null) {
      if (typeof by === "string") {
        keys = [by];
      } else if (Array.isArray(by)) {
        for (const k of by) {
          if (typeof k !== "string") {
            throw new Error("sort: 'by' array elements must be strings");
          }
        }
        keys = by as string[];
      } else {
        throw new Error("sort: 'by' must be a string or list of strings");
      }
    }
    const sorted = [...input];
    sorted.sort((x, y) => {
      if (keys === null) {
        return compareValues(x, y);
      }
      for (const key of keys) {
        const a = (x as A0Record)?.[key] ?? null;
        const b = (y as A0Record)?.[key] ?? null;
        const cmp = compareValues(a, b);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
    return sorted;
  },
};

function compareValues(a: A0Value, b: A0Value): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0;
}

/**
 * filter { in: list, by: str } -> list
 * Keeps elements (records) where element[by] is truthy.
 */
export const filterFn: StdlibFn = {
  name: "filter",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    const by = args["by"] ?? null;
    if (!Array.isArray(input)) {
      throw new Error("filter: 'in' must be a list");
    }
    if (typeof by !== "string") {
      throw new Error("filter: 'by' must be a string");
    }
    return input.filter((el) => {
      if (el === null || typeof el !== "object" || Array.isArray(el)) return false;
      return isTruthy((el as A0Record)[by] ?? null);
    });
  },
};

/**
 * find { in: list, key: str, value: any } -> any|null
 * Finds the first record element where element[key] deeply equals value.
 */
export const findFn: StdlibFn = {
  name: "find",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    const key = args["key"] ?? null;
    const value = args["value"] ?? null;
    if (!Array.isArray(input)) {
      throw new Error("find: 'in' must be a list");
    }
    if (typeof key !== "string") {
      throw new Error("find: 'key' must be a string");
    }
    for (const el of input) {
      if (el !== null && typeof el === "object" && !Array.isArray(el)) {
        if (deepEqual((el as A0Record)[key] ?? null, value)) {
          return el;
        }
      }
    }
    return null;
  },
};

/**
 * range { from: int, to: int } -> list
 * Returns a list of integers from `from` (inclusive) to `to` (exclusive).
 */
export const rangeFn: StdlibFn = {
  name: "range",
  execute(args: A0Record): A0Value {
    const from = args["from"] ?? null;
    const to = args["to"] ?? null;
    if (typeof from !== "number" || typeof to !== "number" || !Number.isInteger(from) || !Number.isInteger(to)) {
      throw new Error("range: 'from' and 'to' must be integers");
    }
    if (from >= to) return [];
    const result: number[] = [];
    for (let i = from; i < to; i++) {
      result.push(i);
    }
    return result;
  },
};

/**
 * join { in: list, sep?: str } -> str
 * Joins list elements into a string with optional separator (default "").
 */
export const joinFn: StdlibFn = {
  name: "join",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    const sepArg = args["sep"] ?? null;
    if (!Array.isArray(input)) {
      throw new Error("join: 'in' must be a list");
    }
    if (sepArg !== null && typeof sepArg !== "string") {
      throw new Error("join: 'sep' must be a string");
    }
    const sep = sepArg ?? "";
    return input.map(String).join(sep);
  },
};

/**
 * unique { in: list } -> list
 * Returns a new list with duplicate values removed (using deep equality).
 */
export const uniqueFn: StdlibFn = {
  name: "unique",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    if (!Array.isArray(input)) {
      throw new Error("unique: 'in' must be a list");
    }
    const result: A0Value[] = [];
    for (const item of input) {
      if (!result.some((existing) => deepEqual(existing, item))) {
        result.push(item);
      }
    }
    return result;
  },
};

/**
 * pluck { in: list, key: str } -> list
 * Extracts the value of a given key from each record in a list.
 * Non-record elements yield null.
 */
export const pluckFn: StdlibFn = {
  name: "pluck",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    const key = args["key"] ?? null;
    if (!Array.isArray(input)) {
      throw new Error("pluck: 'in' must be a list");
    }
    if (typeof key !== "string") {
      throw new Error("pluck: 'key' must be a string");
    }
    return input.map((el) => {
      if (el !== null && typeof el === "object" && !Array.isArray(el)) {
        return (el as A0Record)[key] ?? null;
      }
      return null;
    });
  },
};

/**
 * flat { in: list } -> list
 * Flattens one level of nesting. Non-list elements are preserved as-is.
 */
export const flatFn: StdlibFn = {
  name: "flat",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    if (!Array.isArray(input)) {
      throw new Error("flat: 'in' must be a list");
    }
    const result: A0Value[] = [];
    for (const item of input) {
      if (Array.isArray(item)) {
        for (const sub of item) {
          result.push(sub);
        }
      } else {
        result.push(item);
      }
    }
    return result;
  },
};
