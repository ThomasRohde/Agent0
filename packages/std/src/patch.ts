/**
 * A0 stdlib: patch (JSON Patch-like operations)
 * Supports: add, remove, replace, move, copy, test
 * Based on RFC 6902 conventions.
 */
import type { StdlibFn, A0Record, A0Value } from "@a0/core";

interface PatchOp {
  op: string;
  path: string;
  value?: A0Value;
  from?: string;
}

const MISSING = Symbol("missing");

function parsePointer(pointer: string, label: "path" | "from"): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) {
    throw new Error(`Invalid JSON Pointer '${pointer}' for '${label}'.`);
  }
  return pointer
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function isRecord(value: A0Value): value is A0Record {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value: A0Value): A0Value {
  if (Array.isArray(value)) return value.map((v) => cloneValue(v ?? null));
  if (isRecord(value)) {
    const out: A0Record = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = cloneValue(v ?? null);
    }
    return out;
  }
  return value;
}

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

  if (isRecord(a) && isRecord(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key] ?? null, b[key] ?? null)) return false;
    }
    return true;
  }

  return false;
}

function parseArrayIndex(
  segment: string,
  length: number,
  allowAppend: boolean,
  pointer: string,
  op: string
): number {
  if (segment === "-") {
    if (allowAppend) return length;
    throw new Error(`Invalid array index '-' at '${pointer}' for op '${op}'.`);
  }
  if (!/^(0|[1-9]\d*)$/.test(segment)) {
    throw new Error(`Invalid array index '${segment}' at '${pointer}' for op '${op}'.`);
  }
  const idx = Number(segment);
  if (allowAppend) {
    if (idx < 0 || idx > length) {
      throw new Error(`Array index '${segment}' out of bounds at '${pointer}' for op '${op}'.`);
    }
    return idx;
  }
  if (idx < 0 || idx >= length) {
    throw new Error(`Array index '${segment}' out of bounds at '${pointer}' for op '${op}'.`);
  }
  return idx;
}

function getAtPointer(doc: A0Value, segments: string[]): A0Value | typeof MISSING {
  let current: A0Value | typeof MISSING = doc;
  for (const seg of segments) {
    if (current === null) return MISSING;
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(seg)) return MISSING;
      const idx = Number(seg);
      if (idx < 0 || idx >= current.length) return MISSING;
      current = current[idx] ?? null;
    } else if (isRecord(current)) {
      if (!Object.prototype.hasOwnProperty.call(current, seg)) return MISSING;
      current = current[seg] ?? null;
    } else {
      return MISSING;
    }
  }
  return current;
}

function setAtPointer(
  doc: A0Value,
  segments: string[],
  value: A0Value,
  mode: "add" | "replace" = "add",
  pointer: string = segments.length === 0 ? "" : `/${segments.join("/")}`
): A0Value {
  if (segments.length === 0) return value;
  const [head, ...rest] = segments;

  if (Array.isArray(doc)) {
    const arr = [...doc];
    if (rest.length === 0) {
      const idx = parseArrayIndex(head, arr.length, mode === "add", pointer, mode);
      if (mode === "replace") {
        arr[idx] = value;
      } else {
        arr.splice(idx, 0, value);
      }
    } else {
      const idx = parseArrayIndex(head, arr.length, false, pointer, mode);
      arr[idx] = setAtPointer(arr[idx] ?? null, rest, value, mode);
    }
    return arr;
  }

  if (!isRecord(doc)) {
    throw new Error(`Path '${pointer}' does not exist for op '${mode}'.`);
  }

  const rec: A0Record = { ...doc };
  if (rest.length === 0) {
    if (mode === "replace" && !Object.prototype.hasOwnProperty.call(rec, head)) {
      throw new Error(`Path '${pointer}' does not exist for op 'replace'.`);
    }
    rec[head] = value;
  } else {
    if (!Object.prototype.hasOwnProperty.call(rec, head)) {
      throw new Error(`Path '${pointer}' does not exist for op '${mode}'.`);
    }
    rec[head] = setAtPointer(rec[head] ?? null, rest, value, mode);
  }
  return rec;
}

function removeAtPointer(
  doc: A0Value,
  segments: string[],
  pointer: string = segments.length === 0 ? "" : `/${segments.join("/")}`
): A0Value {
  if (segments.length === 0) return null;
  if (segments.length === 1) {
    const seg = segments[0];
    if (Array.isArray(doc)) {
      const idx = parseArrayIndex(seg, doc.length, false, pointer, "remove");
      const arr = [...doc];
      arr.splice(idx, 1);
      return arr;
    }
    if (isRecord(doc)) {
      if (!Object.prototype.hasOwnProperty.call(doc, seg)) {
        throw new Error(`Path '${pointer}' does not exist for op 'remove'.`);
      }
      const rec = { ...doc };
      delete rec[seg];
      return rec;
    }
    throw new Error(`Path '${pointer}' does not exist for op 'remove'.`);
  }

  const [head, ...rest] = segments;
  if (Array.isArray(doc)) {
    const idx = parseArrayIndex(head, doc.length, false, pointer, "remove");
    const arr = [...doc];
    arr[idx] = removeAtPointer(arr[idx] ?? null, rest);
    return arr;
  }
  if (isRecord(doc)) {
    if (!Object.prototype.hasOwnProperty.call(doc, head)) {
      throw new Error(`Path '${pointer}' does not exist for op 'remove'.`);
    }
    const rec = { ...doc };
    rec[head] = removeAtPointer(rec[head] ?? null, rest);
    return rec;
  }
  throw new Error(`Path '${pointer}' does not exist for op 'remove'.`);
}

function applyOp(doc: A0Value, op: PatchOp): A0Value {
  if (typeof op.op !== "string") {
    throw new Error("patch op requires an 'op' string.");
  }
  if (typeof op.path !== "string") {
    throw new Error("patch op requires a 'path' string.");
  }
  const segments = parsePointer(op.path, "path");

  switch (op.op) {
    case "add":
      return setAtPointer(doc, segments, op.value ?? null);
    case "remove":
      return removeAtPointer(doc, segments);
    case "replace":
      return setAtPointer(doc, segments, op.value ?? null, "replace");
    case "move": {
      if (typeof op.from !== "string") {
        throw new Error("move op requires a 'from' string.");
      }
      const fromSegs = parsePointer(op.from, "from");
      const val = getAtPointer(doc, fromSegs);
      if (val === MISSING) {
        throw new Error(`Path '${op.from}' does not exist for op 'move'.`);
      }
      doc = removeAtPointer(doc, fromSegs);
      return setAtPointer(doc, segments, cloneValue(val));
    }
    case "copy": {
      if (typeof op.from !== "string") {
        throw new Error("copy op requires a 'from' string.");
      }
      const fromSegs = parsePointer(op.from, "from");
      const val = getAtPointer(doc, fromSegs);
      if (val === MISSING) {
        throw new Error(`Path '${op.from}' does not exist for op 'copy'.`);
      }
      return setAtPointer(doc, segments, cloneValue(val));
    }
    case "test": {
      const actual = getAtPointer(doc, segments);
      if (actual === MISSING) {
        throw new Error(`Test failed at '${op.path}': path does not exist.`);
      }
      if (!deepEqual(actual, op.value ?? null)) {
        throw new Error(
          `Test failed at '${op.path}': expected ${JSON.stringify(op.value ?? null)}, got ${JSON.stringify(actual)}`
        );
      }
      return doc;
    }
    default:
      throw new Error(`Unknown patch op '${op.op}'.`);
  }
}

export const patchFn: StdlibFn = {
  name: "patch",
  execute(args: A0Record): A0Value {
    let doc = args["in"] ?? null;
    const ops = args["ops"];
    if (!Array.isArray(ops)) {
      throw new Error("patch requires 'ops' to be a list.");
    }

    for (let i = 0; i < ops.length; i++) {
      const raw = ops[i];
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(`Invalid op at index ${i}.`);
      }
      const op = raw as unknown as PatchOp;
      doc = applyOp(doc, op);
    }

    return doc;
  },
};
