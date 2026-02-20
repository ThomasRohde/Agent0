/**
 * A0 stdlib: math operations
 * math.max, math.min
 */
import type { StdlibFn, A0Record, A0Value } from "@a0/core";

/**
 * math.max { in: list } -> number
 * Returns the maximum value in a numeric list.
 */
export const mathMaxFn: StdlibFn = {
  name: "math.max",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    if (!Array.isArray(input)) {
      throw new Error("math.max: 'in' must be a list");
    }
    if (input.length === 0) {
      throw new Error("math.max: list must not be empty");
    }
    let max = -Infinity;
    for (const item of input) {
      if (typeof item !== "number") {
        throw new Error("math.max: all elements must be numbers");
      }
      if (item > max) max = item;
    }
    return max;
  },
};

/**
 * math.min { in: list } -> number
 * Returns the minimum value in a numeric list.
 */
export const mathMinFn: StdlibFn = {
  name: "math.min",
  execute(args: A0Record): A0Value {
    const input = args["in"] ?? null;
    if (!Array.isArray(input)) {
      throw new Error("math.min: 'in' must be a list");
    }
    if (input.length === 0) {
      throw new Error("math.min: list must not be empty");
    }
    let min = Infinity;
    for (const item of input) {
      if (typeof item !== "number") {
        throw new Error("math.min: all elements must be numbers");
      }
      if (item < min) min = item;
    }
    return min;
  },
};
