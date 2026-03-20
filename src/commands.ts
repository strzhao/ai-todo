import { Command } from "commander";
import { apiRequest } from "./client.js";
import type { ManifestOperation } from "./manifest.js";

/** Convert kebab-case or snake_case to camelCase (matches Commander's opts key conversion) */
function toCamelCase(s: string): string {
  return s.replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
}

export function registerDynamicCommands(
  program: Command,
  operations: ManifestOperation[],
): void {
  for (const op of operations) {
    const cmd = program.command(op.name).description(op.description);

    // Register command aliases
    if (op.aliases?.length) {
      cmd.aliases(op.aliases);
    }

    // Build param alias mapping: camelCaseAlias → original param name
    const paramAliasMap: Record<string, string> = {};
    // Track required params that have aliases (need manual validation)
    const requiredParamsWithAliases: Set<string> = new Set();

    for (const param of op.params) {
      const flag = `--${param.name} <value>`;
      const desc = buildParamDesc(param.description, param.enum);

      if (param.required && !param.aliases?.length) {
        cmd.requiredOption(flag, desc);
      } else {
        cmd.option(flag, desc);
        if (param.required && param.aliases?.length) {
          requiredParamsWithAliases.add(param.name);
        }
      }

      // Register hidden options for param aliases
      if (param.aliases?.length) {
        for (const alias of param.aliases) {
          cmd.option(`--${alias} <value>`); // hidden: no description
          const camelAlias = toCamelCase(alias);
          paramAliasMap[camelAlias] = param.name;
          // Also map the raw alias in case Commander doesn't transform it
          if (camelAlias !== alias) {
            paramAliasMap[alias] = param.name;
          }
        }
      }
    }

    // Use preAction hook for alias mapping — runs before any action (including test overrides)
    if (Object.keys(paramAliasMap).length > 0 || requiredParamsWithAliases.size > 0) {
      cmd.hook('preAction', (thisCommand) => {
        const opts = thisCommand.opts();
        // Map alias values to original param names
        for (const [alias, original] of Object.entries(paramAliasMap)) {
          if (opts[alias] !== undefined && opts[original] === undefined) {
            thisCommand.setOptionValue(original, opts[alias]);
          }
        }

        // Validate required params that have aliases
        const updatedOpts = thisCommand.opts();
        for (const name of requiredParamsWithAliases) {
          if (updatedOpts[name] === undefined) {
            const param = op.params.find(p => p.name === name);
            const aliasList = param?.aliases?.map(a => `--${a}`).join(', ') ?? '';
            console.log(JSON.stringify({
              error: `Missing required option: --${name}`,
              aliases: aliasList ? `Also accepts: ${aliasList}` : undefined,
            }));
            process.exit(1);
          }
        }
      });
    }

    cmd.action(async (opts: Record<string, string>) => {
      const queryParams: Record<string, string> = {};
      const bodyParams: Record<string, unknown> = {};

      for (const param of op.params) {
        const value = opts[param.name];
        if (value === undefined) continue;

        if (param.in === "path") {
          pathParams[param.name] = value;
        } else if (param.in === "query") {
          queryParams[param.name] = value;
        } else {
          bodyParams[param.name] = coerceValue(value, param.type);
        }
      }

      const { data } = await apiRequest(
        op.method,
        op.path,
        pathParams,
        queryParams,
        bodyParams,
        op.fixed_body,
      );
      if (op.format === "text" && typeof data === "object" && data !== null && "output" in data) {
        console.log((data as Record<string, string>).output);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
    });
  }
}

function buildParamDesc(desc?: string, enumValues?: (string | number)[]): string {
  if (!desc) return "";
  if (enumValues?.length) {
    return `${desc} [${enumValues.join("|")}]`;
  }
  return desc;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function findClosestCommand(input: string, candidates: string[]): string | null {
  let best = "";
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshtein(input.toLowerCase(), candidate.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  const threshold = Math.min(Math.ceil(input.length / 2), 3);
  return bestDist <= threshold ? best : null;
}

function coerceValue(value: string, type: string): unknown {
  if (type === "number") {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if (type === "string[]") {
    return value.split(",").map((s) => s.trim());
  }
  return value;
}
