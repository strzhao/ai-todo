/**
 * AI-Friendly CLI Acceptance Tests
 *
 * Validates three features from the design doc:
 * 1. Command aliases — manifest aliases register as Commander commands
 * 2. Parameter aliases — --task / --task_id / --task-id map to --id
 * 3. Smart correction — Levenshtein-based suggestion for typos
 * 4. Backward compatibility — existing commands still work
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Command } from "commander";
import { registerDynamicCommands } from "../commands.js";
import { findClosestCommand } from "../commands.js";
import type { ManifestOperation } from "../manifest.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ManifestOperation for testing */
function makeOp(overrides: Partial<ManifestOperation> & { name: string }): ManifestOperation {
  return {
    id: overrides.id ?? overrides.name,
    description: overrides.description ?? `Test operation ${overrides.name}`,
    method: overrides.method ?? "GET",
    path: overrides.path ?? `/api/test`,
    params: overrides.params ?? [],
    format: overrides.format ?? "json",
    ...overrides,
  };
}

/** Get all registered command names from a Commander program */
function getCommandNames(program: Command): string[] {
  return program.commands.map((c) => c.name());
}

/** Get all registered command names including aliases */
function getCommandNamesAndAliases(program: Command): string[] {
  const result: string[] = [];
  for (const c of program.commands) {
    result.push(c.name());
    result.push(...c.aliases());
  }
  return result;
}

// ---------------------------------------------------------------------------
// 1. Command Alias Registration
// ---------------------------------------------------------------------------
describe("Command aliases", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // prevent process.exit in tests
  });

  it("should register alias commands for operations with aliases field", () => {
    const ops: ManifestOperation[] = [
      makeOp({
        name: "tasks:add-log",
        aliases: ["log"],
        params: [
          { name: "id", in: "path", type: "string", required: true, description: "Task ID" },
          { name: "content", in: "body", type: "string", required: true, description: "Log content" },
        ],
      } as ManifestOperation & { aliases: string[] }),
    ];

    registerDynamicCommands(program, ops);

    const names = getCommandNamesAndAliases(program);
    // Primary name must exist
    expect(names).toContain("tasks:add-log");
    // Alias must also exist
    expect(names).toContain("log");
  });

  it("should register multiple aliases for a single operation", () => {
    const ops: ManifestOperation[] = [
      makeOp({
        name: "tasks:list",
        aliases: ["ls", "list"],
        params: [],
      } as ManifestOperation & { aliases: string[] }),
    ];

    registerDynamicCommands(program, ops);

    const names = getCommandNamesAndAliases(program);
    expect(names).toContain("tasks:list");
    expect(names).toContain("ls");
    expect(names).toContain("list");
  });

  it("should allow invoking the alias the same as the primary command", () => {
    // Both the primary and alias should resolve to the same Command instance
    const ops: ManifestOperation[] = [
      makeOp({
        name: "tasks:tree",
        aliases: ["tree"],
        params: [],
        format: "text",
      } as ManifestOperation & { aliases: string[] }),
    ];

    registerDynamicCommands(program, ops);

    // Commander stores aliases on the primary command object
    const primaryCmd = program.commands.find((c) => c.name() === "tasks:tree");
    expect(primaryCmd).toBeDefined();
    expect(primaryCmd!.aliases()).toContain("tree");
  });
});

// ---------------------------------------------------------------------------
// 2. Parameter Alias Mapping
// ---------------------------------------------------------------------------
describe("Parameter aliases", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
  });

  it("should accept --task as alias for --id parameter", () => {
    const ops: ManifestOperation[] = [
      makeOp({
        name: "tasks:complete",
        params: [
          {
            name: "id",
            in: "path",
            type: "string",
            required: true,
            description: "Task ID",
            aliases: ["task", "task_id", "task-id"],
          } as any,
        ],
      }),
    ];

    registerDynamicCommands(program, ops);

    const cmd = program.commands.find((c) => c.name() === "tasks:complete");
    expect(cmd).toBeDefined();

    // The command should have --task as an option (either as a separate option or via Commander's alias mechanism)
    const optionFlags = cmd!.options.map((o) => o.long);
    // At minimum, --id must exist
    expect(optionFlags).toContain("--id");
    // And the aliases should be registered as accepted flags
    const allFlags = cmd!.options.flatMap((o) => [o.short, o.long].filter(Boolean));
    const allFlagStr = allFlags.join(" ");
    // Either --task is a separate option or combined in the primary option's flags
    expect(
      allFlagStr.includes("--task") ||
        optionFlags.some((f) => f?.includes("task")),
    ).toBe(true);
  });

  it("should map --task_id value to the id parameter", async () => {
    let capturedOpts: Record<string, string> | undefined;

    const ops: ManifestOperation[] = [
      makeOp({
        name: "test:param-alias",
        params: [
          {
            name: "id",
            in: "path",
            type: "string",
            required: true,
            description: "Task ID",
            aliases: ["task", "task_id", "task-id"],
          } as any,
        ],
      }),
    ];

    registerDynamicCommands(program, ops);

    // Override action to capture opts
    const cmd = program.commands.find((c) => c.name() === "test:param-alias");
    expect(cmd).toBeDefined();

    // Replace the action with a spy that captures the resolved options
    cmd!.action((opts: Record<string, string>) => {
      capturedOpts = opts;
    });

    // Parse with --task-id alias
    await program.parseAsync(["node", "test", "test:param-alias", "--task-id", "abc-123"]);

    // The resolved opts should have the canonical name "id" populated
    expect(capturedOpts).toBeDefined();
    expect(capturedOpts!.id).toBe("abc-123");
  });

  it("should map --task value to the id parameter", async () => {
    let capturedOpts: Record<string, string> | undefined;

    const ops: ManifestOperation[] = [
      makeOp({
        name: "test:param-alias2",
        params: [
          {
            name: "id",
            in: "path",
            type: "string",
            required: true,
            description: "Task ID",
            aliases: ["task", "task_id", "task-id"],
          } as any,
        ],
      }),
    ];

    registerDynamicCommands(program, ops);

    const cmd = program.commands.find((c) => c.name() === "test:param-alias2");
    cmd!.action((opts: Record<string, string>) => {
      capturedOpts = opts;
    });

    await program.parseAsync(["node", "test", "test:param-alias2", "--task", "def-456"]);

    expect(capturedOpts).toBeDefined();
    expect(capturedOpts!.id).toBe("def-456");
  });
});

// ---------------------------------------------------------------------------
// 3. Smart Correction (Levenshtein / findClosestCommand)
// ---------------------------------------------------------------------------
describe("Smart correction (findClosestCommand)", () => {
  const knownCommands = [
    "tasks:list",
    "tasks:create",
    "tasks:complete",
    "tasks:update",
    "tasks:delete",
    "tasks:add-log",
    "tasks:tree",
    "log",
    "ls",
    "tree",
    "list",
    "create",
    "add",
    "complete",
    "done",
    "delete",
    "rm",
    "update",
  ];

  it("should suggest 'tasks:add-log' or 'log' for input 'log' if log is in the list", () => {
    // If 'log' is already a known command, exact match should return it
    const result = findClosestCommand("log", knownCommands);
    // 'log' is in the list, so it should match exactly or be returned
    expect(result).toBe("log");
  });

  it("should suggest 'tasks:add-log' for input 'addlog'", () => {
    const result = findClosestCommand("addlog", knownCommands);
    // Closest by edit distance should be tasks:add-log
    expect(result).not.toBeNull();
    expect(["tasks:add-log", "log"]).toContain(result);
  });

  it("should suggest 'tree' or 'tasks:tree' for input 'treee' (typo)", () => {
    const result = findClosestCommand("treee", knownCommands);
    expect(result).not.toBeNull();
    expect(["tree", "tasks:tree"]).toContain(result);
  });

  it("should suggest 'tasks:list' or 'list' for input 'listt'", () => {
    const result = findClosestCommand("listt", knownCommands);
    expect(result).not.toBeNull();
    expect(["list", "tasks:list", "ls"]).toContain(result);
  });

  it("should suggest 'tasks:create' for input 'creat'", () => {
    const result = findClosestCommand("creat", knownCommands);
    expect(result).not.toBeNull();
    expect(["tasks:create", "create"]).toContain(result);
  });

  it("should return null for completely unrelated input 'xyz'", () => {
    const result = findClosestCommand("xyz", knownCommands);
    expect(result).toBeNull();
  });

  it("should return null for very different input 'abcdefghijk'", () => {
    const result = findClosestCommand("abcdefghijk", knownCommands);
    expect(result).toBeNull();
  });

  it("should be case-insensitive (or at least handle common casing)", () => {
    const result = findClosestCommand("Tree", knownCommands);
    // Should still find 'tree' regardless of casing
    expect(result).not.toBeNull();
    expect(["tree", "tasks:tree"]).toContain(result);
  });
});

// ---------------------------------------------------------------------------
// 4. Backward Compatibility
// ---------------------------------------------------------------------------
describe("Backward compatibility", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
  });

  it("should register operations without aliases field normally", () => {
    const ops: ManifestOperation[] = [
      makeOp({
        name: "tasks:list",
        params: [
          { name: "status", in: "query", type: "string", required: false, description: "Filter" },
        ],
      }),
      makeOp({
        name: "tasks:create",
        params: [
          { name: "title", in: "body", type: "string", required: true, description: "Title" },
        ],
      }),
    ];

    registerDynamicCommands(program, ops);

    const names = getCommandNames(program);
    expect(names).toContain("tasks:list");
    expect(names).toContain("tasks:create");
  });

  it("should keep original command name functional when aliases are present", () => {
    const ops: ManifestOperation[] = [
      makeOp({
        name: "tasks:add-log",
        aliases: ["log"],
        params: [
          { name: "id", in: "path", type: "string", required: true },
          { name: "content", in: "body", type: "string", required: true },
        ],
      } as ManifestOperation & { aliases: string[] }),
    ];

    registerDynamicCommands(program, ops);

    // Original full name must still be a valid command
    const cmd = program.commands.find((c) => c.name() === "tasks:add-log");
    expect(cmd).toBeDefined();
    expect(cmd!.name()).toBe("tasks:add-log");
  });

  it("should register params without aliases using only their canonical --name flag", () => {
    const ops: ManifestOperation[] = [
      makeOp({
        name: "tasks:update",
        params: [
          { name: "id", in: "path", type: "string", required: true, description: "Task ID" },
          { name: "title", in: "body", type: "string", required: false, description: "New title" },
        ],
      }),
    ];

    registerDynamicCommands(program, ops);

    const cmd = program.commands.find((c) => c.name() === "tasks:update");
    expect(cmd).toBeDefined();

    const optionFlags = cmd!.options.map((o) => o.long);
    expect(optionFlags).toContain("--id");
    expect(optionFlags).toContain("--title");
  });

  it("should handle mixed operations — some with aliases, some without", () => {
    const ops: ManifestOperation[] = [
      makeOp({
        name: "tasks:add-log",
        aliases: ["log"],
        params: [
          {
            name: "id",
            in: "path",
            type: "string",
            required: true,
            aliases: ["task"],
          } as any,
        ],
      } as ManifestOperation & { aliases: string[] }),
      makeOp({
        name: "tasks:list",
        // no aliases
        params: [
          { name: "status", in: "query", type: "string", required: false },
        ],
      }),
    ];

    registerDynamicCommands(program, ops);

    const names = getCommandNamesAndAliases(program);
    expect(names).toContain("tasks:add-log");
    expect(names).toContain("log");
    expect(names).toContain("tasks:list");
    // tasks:list should NOT have any alias
    const listCmd = program.commands.find((c) => c.name() === "tasks:list");
    expect(listCmd!.aliases()).toHaveLength(0);
  });
});
