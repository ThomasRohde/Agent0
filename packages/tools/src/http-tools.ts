/**
 * A0 Built-in tool: http.get
 */
import type { ToolDef, A0Record, A0Value } from "@a0/core";

export const httpGetTool: ToolDef = {
  name: "http.get",
  mode: "read",
  capabilityId: "http.get",
  async execute(args: A0Record, signal?: AbortSignal): Promise<A0Value> {
    const url = args["url"];
    if (typeof url !== "string") {
      throw new Error("http.get requires a 'url' argument of type string.");
    }

    const headers: Record<string, string> = {};
    if (args["headers"] && typeof args["headers"] === "object" && !Array.isArray(args["headers"])) {
      const hdr = args["headers"] as A0Record;
      for (const [k, v] of Object.entries(hdr)) {
        if (typeof v === "string") headers[k] = v;
      }
    }

    const resp = await fetch(url, {
      method: "GET",
      headers,
      signal,
    });

    const body = await resp.text();
    const respHeaders: A0Record = {};
    resp.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });

    return {
      status: resp.status,
      headers: respHeaders,
      body,
    };
  },
};
