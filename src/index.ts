import { Command } from "commander";
import { createRequire } from "node:module";
import { login } from "./auth.js";
import { loadCredentials, clearCredentials } from "./credentials.js";
import { fetchManifest } from "./manifest.js";
import { registerDynamicCommands, findClosestCommand } from "./commands.js";
import type { ManifestOperation } from "./manifest.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = new Command();

program
  .name("ai-todo")
  .description("CLI for AI agents to interact with ai-todo")
  .version(version);

program
  .command("login")
  .description("Authenticate with ai-todo via browser")
  .option("--token <jwt>", "Directly provide a JWT token (for headless environments)")
  .action(async (opts: { token?: string }) => {
    await login(opts.token);
  });

program
  .command("logout")
  .description("Clear stored credentials")
  .action(() => {
    clearCredentials();
    console.log(JSON.stringify({ success: true, message: "Logged out" }));
  });

program
  .command("whoami")
  .description("Show current authenticated user")
  .action(() => {
    const creds = loadCredentials();
    if (!creds) {
      console.log(JSON.stringify({ error: "Not logged in. Run: ai-todo login" }));
      process.exit(2);
    }
    console.log(JSON.stringify({
      user_id: creds.user_id,
      email: creds.email,
    }));
  });

function setupUnknownCommandHandler(operations: ManifestOperation[]): void {
  program.on("command:*", (operands: string[]) => {
    const unknown = operands[0];
    const allNames: string[] = [];

    // Collect all command names and aliases
    for (const op of operations) {
      allNames.push(op.name);
      if (op.aliases) allNames.push(...op.aliases);
    }
    // Add built-in commands
    allNames.push("login", "logout", "whoami");

    const suggestion = findClosestCommand(unknown, allNames);
    const result: Record<string, unknown> = {
      error: `Unknown command: ${unknown}`,
    };
    if (suggestion) {
      result.suggestion = `Did you mean: ai-todo ${suggestion}`;
    }
    result.hint = "Run 'ai-todo --help' to see all available commands";
    console.log(JSON.stringify(result));
    process.exit(1);
  });
}

async function main() {
  const firstArg = process.argv[2];
  const skipCommands = ["login", "logout", "whoami"];
  const isVersionFlag = firstArg === "--version" || firstArg === "-V";
  const isBuiltinCommand = firstArg !== undefined && skipCommands.includes(firstArg);

  if (!isVersionFlag && !isBuiltinCommand) {
    try {
      const manifest = await fetchManifest();
      registerDynamicCommands(program, manifest.operations);
      setupUnknownCommandHandler(manifest.operations);
    } catch {
      // For help/empty args, show what we have even if manifest fetch fails
      const isHelpOrEmpty = !firstArg || ["help", "--help", "-h"].includes(firstArg);
      if (!isHelpOrEmpty) {
        console.log(JSON.stringify({ error: "Failed to load commands from server" }));
        process.exit(1);
      }
    }
  }

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.log(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }));
  process.exit(1);
});
