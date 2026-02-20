/**
 * A0 Built-in tools: fs.read and fs.write
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { ToolDef, A0Record, A0Value } from "@a0/core";
import { fsReadInputSchema, fsWriteInputSchema, fsListInputSchema, fsExistsInputSchema } from "./schemas.js";

export const fsReadTool: ToolDef = {
  name: "fs.read",
  mode: "read",
  capabilityId: "fs.read",
  inputSchema: fsReadInputSchema,
  async execute(args: A0Record): Promise<A0Value> {
    const filePath = args["path"];
    if (typeof filePath !== "string") {
      throw new Error("fs.read requires a 'path' argument of type string.");
    }
    const encoding = args["encoding"] ?? "utf8";
    if (encoding === "utf8") {
      return fs.readFileSync(path.resolve(filePath), "utf-8");
    } else {
      const buf = fs.readFileSync(path.resolve(filePath));
      return buf.toString("base64");
    }
  },
};

export const fsWriteTool: ToolDef = {
  name: "fs.write",
  mode: "effect",
  capabilityId: "fs.write",
  inputSchema: fsWriteInputSchema,
  async execute(args: A0Record): Promise<A0Value> {
    const filePath = args["path"];
    if (typeof filePath !== "string") {
      throw new Error("fs.write requires a 'path' argument of type string.");
    }
    const format = args["format"] ?? "raw";
    let data: string;

    if (format === "json") {
      data = JSON.stringify(args["data"], null, 2);
    } else if (typeof args["data"] === "string") {
      data = args["data"];
    } else {
      data = JSON.stringify(args["data"]);
    }

    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, data, "utf-8");

    const sha256 = crypto.createHash("sha256").update(data).digest("hex");
    const bytes = Buffer.byteLength(data, "utf-8");

    return {
      kind: "file",
      path: resolved,
      bytes,
      sha256,
    };
  },
};

export const fsListTool: ToolDef = {
  name: "fs.list",
  mode: "read",
  capabilityId: "fs.read",
  inputSchema: fsListInputSchema,
  async execute(args: A0Record): Promise<A0Value> {
    const dirPath = args["path"];
    if (typeof dirPath !== "string") {
      throw new Error("fs.list requires a 'path' argument of type string.");
    }
    const resolved = path.resolve(dirPath);
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
    }));
  },
};

export const fsExistsTool: ToolDef = {
  name: "fs.exists",
  mode: "read",
  capabilityId: "fs.read",
  inputSchema: fsExistsInputSchema,
  async execute(args: A0Record): Promise<A0Value> {
    const filePath = args["path"];
    if (typeof filePath !== "string") {
      throw new Error("fs.exists requires a 'path' argument of type string.");
    }
    return fs.existsSync(path.resolve(filePath));
  },
};
