import { Command } from "commander";
import { apiRequest } from "./client.js";
import type { ManifestOperation } from "./manifest.js";

export function registerDynamicCommands(
  program: Command,
  operations: ManifestOperation[],
): void {
  for (const op of operations) {
    const cmd = program.command(op.name).description(op.description);

    for (const param of op.params) {
      const flag = `--${param.name} <value>`;
      const desc = buildParamDesc(param.description, param.enum);

      if (param.required) {
        cmd.requiredOption(flag, desc);
      } else {
        cmd.option(flag, desc);
      }
    }

    cmd.action(async (opts: Record<string, string>) => {
      const pathParams: Record<string, string> = {};
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
