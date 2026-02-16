/**
 * A0 stdlib: parse.json
 */
import type { StdlibFn, A0Record, A0Value } from "@a0/core";

export const parseJsonFn: StdlibFn = {
  name: "parse.json",
  execute(args: A0Record): A0Value {
    const input = args["in"];
    if (typeof input !== "string") {
      return { err: { code: "E_TYPE", message: "parse.json requires 'in' to be a string." } };
    }
    try {
      return JSON.parse(input) as A0Value;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { err: { code: "E_JSON", message: msg } };
    }
  },
};
