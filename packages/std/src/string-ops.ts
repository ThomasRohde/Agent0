/**
 * A0 stdlib: string operations
 * str.concat, str.split, str.starts, str.replace
 */
import type { StdlibFn, A0Record, A0Value } from "@a0/core";

/**
 * str.concat { parts: list } -> str
 * Concatenates all parts into a single string.
 */
export const strConcatFn: StdlibFn = {
  name: "str.concat",
  execute(args: A0Record): A0Value {
    const parts = args["parts"] ?? null;
    if (!Array.isArray(parts)) {
      throw new Error("str.concat: 'parts' must be a list");
    }
    return parts.map(String).join("");
  },
};

/**
 * str.split { in: str, sep: str } -> list
 * Splits a string by separator.
 */
export const strSplitFn: StdlibFn = {
  name: "str.split",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    const sep = args["sep"] ?? null;
    if (typeof input !== "string") {
      throw new Error("str.split: 'in' must be a string");
    }
    if (typeof sep !== "string") {
      throw new Error("str.split: 'sep' must be a string");
    }
    return input.split(sep);
  },
};

/**
 * str.starts { in: str, value: str } -> bool
 * Checks if the string starts with the given value.
 */
export const strStartsFn: StdlibFn = {
  name: "str.starts",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    const value = args["value"] ?? null;
    if (typeof input !== "string") {
      throw new Error("str.starts: 'in' must be a string");
    }
    if (typeof value !== "string") {
      throw new Error("str.starts: 'value' must be a string");
    }
    return input.startsWith(value);
  },
};

/**
 * str.replace { in: str, from: str, to: str } -> str
 * Replaces all occurrences of `from` with `to`.
 */
export const strReplaceFn: StdlibFn = {
  name: "str.replace",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    const from = args["from"] ?? null;
    const to = args["to"] ?? null;
    if (typeof input !== "string") {
      throw new Error("str.replace: 'in' must be a string");
    }
    if (typeof from !== "string") {
      throw new Error("str.replace: 'from' must be a string");
    }
    if (typeof to !== "string") {
      throw new Error("str.replace: 'to' must be a string");
    }
    return input.replaceAll(from, to);
  },
};
