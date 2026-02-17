/**
 * Tests for the A0 tool registry.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { registerTool, getTool, getAllTools } from "./registry.js";
import type { ToolDef, A0Value } from "@a0/core";

describe("Tool Registry", () => {
  it("registers and retrieves a tool", () => {
    const tool: ToolDef = {
      name: "test.mytool",
      mode: "read",
      capabilityId: "test.mytool",
      async execute(): Promise<A0Value> { return null; },
    };
    registerTool(tool);
    const retrieved = getTool("test.mytool");
    assert.ok(retrieved);
    assert.equal(retrieved!.name, "test.mytool");
    assert.equal(retrieved!.mode, "read");
  });

  it("returns undefined for unregistered tool", () => {
    const retrieved = getTool("nonexistent.tool.xyz");
    assert.equal(retrieved, undefined);
  });

  it("getAllTools returns a map of all registered tools", () => {
    const tool: ToolDef = {
      name: "test.another",
      mode: "effect",
      capabilityId: "test.another",
      async execute(): Promise<A0Value> { return null; },
    };
    registerTool(tool);
    const all = getAllTools();
    assert.ok(all instanceof Map);
    assert.ok(all.has("test.another"));
  });

  it("getAllTools returns a copy (not the internal map)", () => {
    const all = getAllTools();
    const sizeBefore = all.size;
    all.set("fake.tool", {} as ToolDef);
    const all2 = getAllTools();
    assert.equal(all2.size, sizeBefore);
  });

  it("overwrites tool with same name on re-register", () => {
    const tool1: ToolDef = {
      name: "test.overwrite",
      mode: "read",
      capabilityId: "test.overwrite",
      async execute(): Promise<A0Value> { return "v1"; },
    };
    const tool2: ToolDef = {
      name: "test.overwrite",
      mode: "effect",
      capabilityId: "test.overwrite",
      async execute(): Promise<A0Value> { return "v2"; },
    };
    registerTool(tool1);
    registerTool(tool2);
    const retrieved = getTool("test.overwrite");
    assert.ok(retrieved);
    assert.equal(retrieved!.mode, "effect");
  });
});
