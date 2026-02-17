/**
 * A0 stdlib: boolean/predicate helpers
 * eq, contains, not, and, or
 */
import { isTruthy } from "@a0/core";
import type { StdlibFn, A0Record, A0Value } from "@a0/core";

/**
 * eq { a: <value>, b: <value> } -> boolean
 * Deep equality via JSON.stringify comparison.
 */
export const eqFn: StdlibFn = {
  name: "eq",
  execute(args: A0Record): A0Value {
    const a = args["a"] ?? null;
    const b = args["b"] ?? null;
    return JSON.stringify(a) === JSON.stringify(b);
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
      const needle = JSON.stringify(value);
      return input.some((el) => JSON.stringify(el) === needle);
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
