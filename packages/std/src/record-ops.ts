/**
 * A0 stdlib: record operations
 * keys, values, merge
 */
import type { StdlibFn, A0Record, A0Value } from "@a0/core";

/**
 * keys { in: rec } -> list
 * Returns the keys of a record.
 */
export const keysFn: StdlibFn = {
  name: "keys",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("keys: 'in' must be a record");
    }
    return Object.keys(input as A0Record);
  },
};

/**
 * values { in: rec } -> list
 * Returns the values of a record.
 */
export const valuesFn: StdlibFn = {
  name: "values",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("values: 'in' must be a record");
    }
    return Object.values(input as A0Record);
  },
};

/**
 * merge { a: rec, b: rec } -> rec
 * Shallow merges two records. b wins on key conflicts.
 */
export const mergeFn: StdlibFn = {
  name: "merge",
  execute(args: A0Record): A0Value {
    const a = args["a"] ?? null;
    const b = args["b"] ?? null;
    if (
      a === null || typeof a !== "object" || Array.isArray(a) ||
      b === null || typeof b !== "object" || Array.isArray(b)
    ) {
      throw new Error("merge: 'a' and 'b' must be records");
    }
    return { ...(a as A0Record), ...(b as A0Record) };
  },
};
