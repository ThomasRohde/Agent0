import { z } from "zod";

export const fsReadInputSchema = z.object({
  path: z.string({ required_error: "fs.read requires a 'path' argument" }),
  encoding: z.string().optional(),
});

export const fsWriteInputSchema = z.object({
  path: z.string({ required_error: "fs.write requires a 'path' argument" }),
  data: z.unknown(),
  format: z.string().optional(),
});

export const httpGetInputSchema = z.object({
  url: z.string({ required_error: "http.get requires a 'url' argument" }),
  headers: z.record(z.string()).optional(),
});

export const shExecInputSchema = z.object({
  cmd: z.string({ required_error: "sh.exec requires a 'cmd' argument" }),
  cwd: z.string().optional(),
  timeoutMs: z.number().optional(),
  env: z.record(z.string()).optional(),
});
