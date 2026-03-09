import { type NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getAllActiveTasks } from "@/lib/db";
import { buildTree } from "@/lib/task-utils";
import type { TaskNode } from "@/lib/task-utils";

export const preferredRegion = "hkg1";

interface TreeItem {
  id: string;
  title: string;
  pinned?: boolean;
  priority: number;
  children: TreeItem[];
}

function toTreeItem(node: TaskNode): TreeItem {
  const item: TreeItem = {
    id: node.id,
    title: node.title,
    priority: node.priority,
    children: node.subtasks.map(toTreeItem),
  };
  if (node.pinned) item.pinned = true;
  return item;
}

function sortNodes(nodes: TaskNode[]) {
  nodes.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.priority - b.priority;
  });
  for (const n of nodes) sortNodes(n.subtasks);
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initDb();
  const tasks = await getAllActiveTasks(user.id);
  const roots = buildTree(tasks);
  sortNodes(roots);

  return NextResponse.json(roots.map(toTreeItem));
}
