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

function parsePointer(pointer: string): string[] {
  if (pointer === "" || pointer === "/") return [];
  return pointer
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function getAtPointer(doc: A0Value, segments: string[]): A0Value {
  let current = doc;
  for (const seg of segments) {
    if (current === null) return null;
    if (Array.isArray(current)) {
      const idx = parseInt(seg, 10);
      if (isNaN(idx)) return null;
      current = current[idx] ?? null;
    } else if (typeof current === "object") {
      current = (current as A0Record)[seg] ?? null;
    } else {
      return null;
    }
  }
  return current;
}

function setAtPointer(doc: A0Value, segments: string[], value: A0Value): A0Value {
  if (segments.length === 0) return value;
  const [head, ...rest] = segments;

  if (Array.isArray(doc)) {
    const idx = head === "-" ? doc.length : parseInt(head, 10);
    const arr = [...doc];
    if (rest.length === 0) {
      arr.splice(idx, 0, value);
    } else {
      arr[idx] = setAtPointer(arr[idx] ?? null, rest, value);
    }
    return arr;
  }

  const rec: A0Record =
    doc !== null && typeof doc === "object" ? { ...(doc as A0Record) } : {};
  if (rest.length === 0) {
    rec[head] = value;
  } else {
    rec[head] = setAtPointer(rec[head] ?? null, rest, value);
  }
  return rec;
}

function removeAtPointer(doc: A0Value, segments: string[]): A0Value {
  if (segments.length === 0) return null;
  if (segments.length === 1) {
    const seg = segments[0];
    if (Array.isArray(doc)) {
      const idx = parseInt(seg, 10);
      const arr = [...doc];
      arr.splice(idx, 1);
      return arr;
    }
    if (doc !== null && typeof doc === "object") {
      const rec = { ...(doc as A0Record) };
      delete rec[seg];
      return rec;
    }
    return doc;
  }

  const [head, ...rest] = segments;
  if (Array.isArray(doc)) {
    const idx = parseInt(head, 10);
    const arr = [...doc];
    arr[idx] = removeAtPointer(arr[idx], rest);
    return arr;
  }
  if (doc !== null && typeof doc === "object") {
    const rec = { ...(doc as A0Record) };
    rec[head] = removeAtPointer(rec[head] ?? null, rest);
    return rec;
  }
  return doc;
}

function applyOp(doc: A0Value, op: PatchOp): A0Value {
  const segments = parsePointer(op.path);

  switch (op.op) {
    case "add":
      return setAtPointer(doc, segments, op.value ?? null);
    case "remove":
      return removeAtPointer(doc, segments);
    case "replace":
      return setAtPointer(doc, segments, op.value ?? null);
    case "move": {
      const fromSegs = parsePointer(op.from ?? "");
      const val = getAtPointer(doc, fromSegs);
      doc = removeAtPointer(doc, fromSegs);
      return setAtPointer(doc, segments, val);
    }
    case "copy": {
      const fromSegs = parsePointer(op.from ?? "");
      const val = getAtPointer(doc, fromSegs);
      return setAtPointer(doc, segments, val);
    }
    case "test": {
      const actual = getAtPointer(doc, segments);
      if (JSON.stringify(actual) !== JSON.stringify(op.value)) {
        throw new Error(
          `Test failed at '${op.path}': expected ${JSON.stringify(op.value)}, got ${JSON.stringify(actual)}`
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
