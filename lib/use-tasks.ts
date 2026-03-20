import useSWR, { mutate } from "swr";
import type { Task } from "./types";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  });

const SWR_CONFIG = {
  dedupingInterval: 5000,
  revalidateOnFocus: true,
  keepPreviousData: true,
};

/** 获取活跃任务（个人或空间） */
export function useTasks(spaceId?: string) {
  const key = spaceId ? `/api/tasks?space_id=${spaceId}` : "/api/tasks";
  return useSWR<Task[]>(key, fetcher, SWR_CONFIG);
}

/** 获取已完成任务 */
export function useCompletedTasks(spaceId?: string) {
  const key = spaceId
    ? `/api/tasks?space_id=${spaceId}&filter=completed`
    : "/api/tasks?filter=completed";
  return useSWR<Task[]>(key, fetcher, SWR_CONFIG);
}

/** 获取笔记 */
export function useNotes(spaceId?: string) {
  const key = spaceId
    ? `/api/tasks?type=1&space_id=${spaceId}`
    : "/api/tasks?type=1";
  return useSWR<Task[]>(key, fetcher, SWR_CONFIG);
}

/** 空间任务（侧边栏目录用） */
export function useSpaceTasks(spaceId: string | null) {
  const key = spaceId ? `/api/tasks?space_id=${spaceId}` : null;
  return useSWR<Task[]>(key, fetcher, SWR_CONFIG);
}

/** 统一的 mutate 工具：让所有以 /api/tasks 开头的 key 重新验证 */
export function mutateTasks() {
  mutate((key) => typeof key === "string" && key.startsWith("/api/tasks"));
}
