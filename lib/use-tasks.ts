import { useState, useMemo, useCallback, useEffect } from "react";
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

/** 获取已完成任务（游标分页） */
export function useCompletedTasks(spaceId?: string) {
  const key = spaceId
    ? `/api/tasks?space_id=${spaceId}&filter=completed`
    : "/api/tasks?filter=completed";

  const [extraTasks, setExtraTasks] = useState<Task[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Reset extra pages when key changes (e.g., switching spaces)
  useEffect(() => {
    setExtraTasks([]);
    setHasMore(false);
  }, [key]);

  const completedFetcher = useCallback(async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.statusText);
    setHasMore(r.headers.get("X-Has-More") === "true");
    return r.json();
  }, []);

  const swr = useSWR<Task[]>(key, completedFetcher, SWR_CONFIG);

  const allData = useMemo(() => {
    if (!swr.data) return undefined;
    return extraTasks.length > 0 ? [...swr.data, ...extraTasks] : swr.data;
  }, [swr.data, extraTasks]);

  const loadMore = useCallback(async () => {
    const current = allData;
    if (!current || current.length === 0 || isLoadingMore) return;

    const last = current[current.length - 1];
    const params = new URLSearchParams();
    if (spaceId) params.set("space_id", spaceId);
    params.set("filter", "completed");
    params.set("before", last.completed_at || last.created_at);
    params.set("before_id", last.id);

    setIsLoadingMore(true);
    try {
      const r = await fetch(`/api/tasks?${params}`);
      if (!r.ok) throw new Error(r.statusText);
      setHasMore(r.headers.get("X-Has-More") === "true");
      const moreTasks: Task[] = await r.json();
      setExtraTasks((prev) => [...prev, ...moreTasks]);
    } finally {
      setIsLoadingMore(false);
    }
  }, [allData, spaceId, isLoadingMore]);

  return { ...swr, data: allData, hasMore, loadMore, isLoadingMore };
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
