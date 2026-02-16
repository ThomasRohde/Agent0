/**
 * A0 Tool Registry
 */
import type { ToolDef } from "@a0/core";

const registry = new Map<string, ToolDef>();

export function registerTool(tool: ToolDef): void {
  registry.set(tool.name, tool);
}

export function getTool(name: string): ToolDef | undefined {
  return registry.get(name);
}

export function getAllTools(): Map<string, ToolDef> {
  return new Map(registry);
}
