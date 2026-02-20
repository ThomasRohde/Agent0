/**
 * @a0/tools - Built-in A0 tools
 */
export { registerTool, getTool, getAllTools } from "./registry.js";
export { fsReadTool, fsWriteTool, fsListTool, fsExistsTool } from "./fs-tools.js";
export { httpGetTool } from "./http-tools.js";
export { shExecTool } from "./sh-tools.js";

import { registerTool } from "./registry.js";
import { fsReadTool, fsWriteTool, fsListTool, fsExistsTool } from "./fs-tools.js";
import { httpGetTool } from "./http-tools.js";
import { shExecTool } from "./sh-tools.js";

/**
 * Register all built-in tools.
 */
export function registerBuiltinTools(): void {
  registerTool(fsReadTool);
  registerTool(fsWriteTool);
  registerTool(fsListTool);
  registerTool(fsExistsTool);
  registerTool(httpGetTool);
  registerTool(shExecTool);
}
