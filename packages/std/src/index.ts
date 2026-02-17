/**
 * @a0/std - A0 Standard Library
 */
import type { StdlibFn } from "@a0/core";
export { parseJsonFn } from "./parse-json.js";
export { getFn, putFn } from "./path-ops.js";
export { patchFn } from "./patch.js";
export { eqFn, containsFn, notFn, andFn, orFn } from "./predicates.js";

import { parseJsonFn } from "./parse-json.js";
import { getFn, putFn } from "./path-ops.js";
import { patchFn } from "./patch.js";
import { eqFn, containsFn, notFn, andFn, orFn } from "./predicates.js";

/**
 * Get all stdlib functions as a Map.
 */
export function getStdlibFns(): Map<string, StdlibFn> {
  const fns = new Map<string, StdlibFn>();
  for (const fn of [parseJsonFn, getFn, putFn, patchFn, eqFn, containsFn, notFn, andFn, orFn]) {
    fns.set(fn.name, fn);
  }
  return fns;
}
