/**
 * A0 stdlib: get, put (record path operations)
 * Path syntax: dot-separated keys, bracket notation for array indices.
 * E.g. "foo.bar[0].baz"
 */
import type { StdlibFn, A0Record, A0Value } from "@a0/core";

function parsePath(pathStr: string): (string | number)[] {
  const segments: (string | number)[] = [];
  const parts = pathStr.split(/\.|\[(\d+)\]/).filter((s) => s !== "" && s !== undefined);
  for (const part of parts) {
    const num = Number(part);
    if (!isNaN(num) && /^\d+$/.test(part)) {
      segments.push(num);
    } else {
      segments.push(part);
    }
  }
  return segments;
}

function getByPath(obj: A0Value, segments: (string | number)[]): A0Value {
  let current: A0Value = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return null;
    if (typeof seg === "number") {
      if (Array.isArray(current)) {
        current = current[seg] ?? null;
      } else {
        return null;
      }
    } else {
      if (typeof current === "object" && !Array.isArray(current)) {
        current = (current as A0Record)[seg] ?? null;
      } else {
        return null;
      }
    }
  }
  return current;
}

function putByPath(obj: A0Value, segments: (string | number)[], value: A0Value): A0Value {
  if (segments.length === 0) return value;

  const seg = segments[0];
  const rest = segments.slice(1);

  if (typeof seg === "number") {
    const arr = Array.isArray(obj) ? [...obj] : [];
    while (arr.length <= seg) arr.push(null);
    arr[seg] = putByPath(arr[seg], rest, value);
    return arr;
  } else {
    const rec: A0Record =
      obj !== null && typeof obj === "object" && !Array.isArray(obj)
        ? { ...(obj as A0Record) }
        : {};
    rec[seg] = putByPath(rec[seg] ?? null, rest, value);
    return rec;
  }
}

export const getFn: StdlibFn = {
  name: "get",
  execute(args: A0Record): A0Value {
    const input = args["in"];
    const pathStr = args["path"];
    if (typeof pathStr !== "string") {
      throw new Error("get requires 'path' to be a string.");
    }
    const segments = parsePath(pathStr);
    return getByPath(input ?? null, segments);
  },
};

export const putFn: StdlibFn = {
  name: "put",
  execute(args: A0Record): A0Value {
    const input = args["in"];
    const pathStr = args["path"];
    const value = args["value"] ?? null;
    if (typeof pathStr !== "string") {
      throw new Error("put requires 'path' to be a string.");
    }
    const segments = parsePath(pathStr);
    return putByPath(input ?? null, segments, value);
  },
};
