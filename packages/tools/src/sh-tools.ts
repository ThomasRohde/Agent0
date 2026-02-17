/**
 * A0 Built-in tool: sh.exec
 */
import { execSync } from "node:child_process";
import type { ToolDef, A0Record, A0Value } from "@a0/core";
import { shExecInputSchema } from "./schemas.js";

export const shExecTool: ToolDef = {
  name: "sh.exec",
  mode: "effect",
  capabilityId: "sh.exec",
  inputSchema: shExecInputSchema,
  async execute(args: A0Record): Promise<A0Value> {
    const cmd = args["cmd"];
    if (typeof cmd !== "string") {
      throw new Error("sh.exec requires a 'cmd' argument of type string.");
    }

    const cwd = typeof args["cwd"] === "string" ? args["cwd"] : process.cwd();
    const timeoutMs = typeof args["timeoutMs"] === "number" ? args["timeoutMs"] : 30000;

    const envVars: Record<string, string> = { ...process.env } as Record<string, string>;
    if (args["env"] && typeof args["env"] === "object" && !Array.isArray(args["env"])) {
      const userEnv = args["env"] as A0Record;
      for (const [k, v] of Object.entries(userEnv)) {
        if (typeof v === "string") envVars[k] = v;
      }
    }

    const startMs = Date.now();
    try {
      const stdout = execSync(cmd, {
        cwd,
        timeout: timeoutMs,
        env: envVars,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 10 * 1024 * 1024,
      });

      const durationMs = Date.now() - startMs;
      return {
        exitCode: 0,
        stdout: stdout ?? "",
        stderr: "",
        durationMs,
      };
    } catch (e: unknown) {
      const durationMs = Date.now() - startMs;
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return {
        exitCode: err.status ?? 1,
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? "",
        durationMs,
      };
    }
  },
};
