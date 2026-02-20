/**
 * A0 stdlib: boolean/predicate helpers
 * eq, contains, not, and, or
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
 * eq { a: <value>, b: <value> } -> boolean
 * Deep structural equality.
 */
export const eqFn: StdlibFn = {
  name: "eq",
  execute(args: A0Record): A0Value {
    const a = args["a"] ?? null;
    const b = args["b"] ?? null;
    return deepEqual(a, b);
  },
};

/**
 * contains { in: <string|list|record>, value: <value> } -> boolean
 * - string: substring check (value must be string)
 * - list: deep element membership via JSON.stringify
 * - record: key existence (value must be string)
 */
export const containsFn: StdlibFn = {
  name: "contains",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    const value = args["value"] ?? null;

    // string: substring check
    if (typeof input === "string") {
      if (typeof value !== "string") return false;
      return input.includes(value);
    }

    // list: deep element membership
    if (Array.isArray(input)) {
      return input.some((el) => deepEqual(el ?? null, value));
    }

    // record: key existence (value must be string)
    if (input !== null && typeof input === "object") {
      if (typeof value !== "string") return false;
      return Object.prototype.hasOwnProperty.call(input, value);
    }

    return false;
  },
};

/**
 * not { in: <value> } -> boolean
 * Boolean negation with A0 truthiness coercion.
 */
export const notFn: StdlibFn = {
  name: "not",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    return !isTruthy(input);
  },
};

/**
 * and { a: <value>, b: <value> } -> boolean
 * Logical AND with A0 truthiness coercion.
 */
export const andFn: StdlibFn = {
  name: "and",
  execute(args: A0Record): A0Value {
    const a = args["a"] ?? null;
    const b = args["b"] ?? null;
    return isTruthy(a) && isTruthy(b);
  },
};

/**
 * or { a: <value>, b: <value> } -> boolean
 * Logical OR with A0 truthiness coercion.
 */
export const orFn: StdlibFn = {
  name: "or",
  execute(args: A0Record): A0Value {
    const a = args["a"] ?? null;
    const b = args["b"] ?? null;
    return isTruthy(a) || isTruthy(b);
  },
};

/**
 * coalesce { in: val, default: fallback } -> value
 * Returns `in` if not null, else `default`. Strictly null-checking (NOT truthiness).
 */
export const coalesceFn: StdlibFn = {
  name: "coalesce",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    const fallback = args["default"] ?? null;
    return input !== null ? input : fallback;
  },
};

/**
 * typeof { in: val } -> str
 * Returns the A0 type name: "null", "boolean", "number", "string", "list", "record".
 */
export const typeofFn: StdlibFn = {
  name: "typeof",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    if (input === null) return "null";
    if (typeof input === "boolean") return "boolean";
    if (typeof input === "number") return "number";
    if (typeof input === "string") return "string";
    if (Array.isArray(input)) return "list";
    return "record";
  },
};
