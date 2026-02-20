/**
 * @a0/std - A0 Standard Library
 */
import type { StdlibFn } from "@a0/core";
export { parseJsonFn } from "./parse-json.js";
export { getFn, putFn } from "./path-ops.js";
export { patchFn } from "./patch.js";
export { eqFn, containsFn, notFn, andFn, orFn } from "./predicates.js";
export { lenFn, appendFn, concatFn, sortFn, filterFn, findFn, rangeFn, joinFn, uniqueFn } from "./list-ops.js";
export { strConcatFn, strSplitFn, strStartsFn, strEndsFn, strReplaceFn } from "./string-ops.js";
export { keysFn, valuesFn, mergeFn } from "./record-ops.js";
export { mathMaxFn, mathMinFn } from "./math-ops.js";

import { parseJsonFn } from "./parse-json.js";
import { getFn, putFn } from "./path-ops.js";
import { patchFn } from "./patch.js";
import { eqFn, containsFn, notFn, andFn, orFn } from "./predicates.js";
import { lenFn, appendFn, concatFn, sortFn, filterFn, findFn, rangeFn, joinFn, uniqueFn } from "./list-ops.js";
import { strConcatFn, strSplitFn, strStartsFn, strEndsFn, strReplaceFn } from "./string-ops.js";
import { keysFn, valuesFn, mergeFn } from "./record-ops.js";
import { mathMaxFn, mathMinFn } from "./math-ops.js";

/**
 * Get all stdlib functions as a Map.
 */
export function getStdlibFns(): Map<string, StdlibFn> {
  const fns = new Map<string, StdlibFn>();
  for (const fn of [
    parseJsonFn, getFn, putFn, patchFn, eqFn, containsFn, notFn, andFn, orFn,
    lenFn, appendFn, concatFn, sortFn, filterFn, findFn, rangeFn, joinFn,
    strConcatFn, strSplitFn, strStartsFn, strEndsFn, strReplaceFn,
    keysFn, valuesFn, mergeFn,
    mathMaxFn, mathMinFn,
    uniqueFn,
  ]) {
    fns.set(fn.name, fn);
  }
  return fns;
}
