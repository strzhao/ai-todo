import { type NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getAllActiveTasks } from "@/lib/db";
import { buildTree } from "@/lib/task-utils";
import type { TaskNode } from "@/lib/task-utils";

export const preferredRegion = "hkg1";

function renderNode(
  node: TaskNode,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
): string[] {
  const connector = isRoot ? "" : isLast ? "└── " : "├── ";
  const pin = node.pinned ? "📌 " : "";
  const shortId = node.id.substring(0, 8);
  const line = `${prefix}${connector}${pin}${node.title} (${shortId})`;

  const lines = [line];
  const childPrefix = isRoot
    ? prefix
    : prefix + (isLast ? "    " : "│   ");

  node.subtasks.forEach((child, i) => {
    lines.push(
      ...renderNode(child, childPrefix, i === node.subtasks.length - 1, false),
    );
  });

  return lines;
}

function formatTree(roots: TaskNode[]): string {
  if (roots.length === 0) return "(no active tasks)";

  // Sort: pinned first, then by priority
  const sort = (nodes: TaskNode[]) => {
    nodes.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return a.priority - b.priority;
    });
    for (const n of nodes) sort(n.subtasks);
  };
  sort(roots);

  const lines: string[] = [];
  for (const root of roots) {
    lines.push(...renderNode(root, "", false, true));
  }
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initDb();
  const tasks = await getAllActiveTasks(user.id);
  const roots = buildTree(tasks);
  const tree = formatTree(roots);

  return NextResponse.json({ output: tree });
}
