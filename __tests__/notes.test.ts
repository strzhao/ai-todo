import { describe, it, expect } from "vitest";
import { toNoteDTO } from "@/lib/notes";
import type { Task } from "@/lib/types";

describe("toNoteDTO 字段收窄", () => {
  const fullTask: Task = {
    id: "n-1",
    user_id: "u-1",
    title: "测试笔记",
    description: "正文",
    due_date: "2026-12-31T00:00:00Z",
    start_date: "2026-01-01T00:00:00Z",
    end_date: "2026-02-01T00:00:00Z",
    priority: 1,
    status: 0,
    tags: ["x", "y"],
    sort_order: 5,
    created_at: "2026-07-08T00:00:00Z",
    completed_at: undefined,
    space_id: undefined,
    assignee_id: "a-1",
    assignee_email: "a@b.c",
    mentioned_emails: ["m@b.c"],
    parent_id: undefined,
    progress: 40,
    type: 1,
    pinned: undefined,
    invite_code: undefined,
    invite_mode: undefined,
    share_code: "abc12345",
    voice_raw_text: "raw",
    milestone: "v1",
    org_id: undefined,
  };

  it("仅暴露 NoteDTO 7 字段", () => {
    const dto = toNoteDTO(fullTask);
    const keys = Object.keys(dto).sort();
    expect(keys).toEqual(
      ["created_at", "description", "id", "share_code", "space_id", "tags", "title"].sort()
    );
  });

  it("屏蔽任务语义字段", () => {
    const dto = toNoteDTO(fullTask);
    const keys = new Set(Object.keys(dto));
    // 禁止暴露的字段不得出现
    for (const forbidden of [
      "priority",
      "status",
      "due_date",
      "start_date",
      "end_date",
      "assignee_id",
      "assignee_email",
      "mentioned_emails",
      "progress",
      "sort_order",
      "milestone",
      "type",
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it("description/tags/share_code/space_id 默认值处理", () => {
    const dto = toNoteDTO({
      ...fullTask,
      description: undefined,
      tags: [],
      share_code: undefined,
      space_id: undefined,
    });
    expect(dto.description).toBeNull();
    expect(dto.tags).toEqual([]);
    expect(dto.share_code).toBeNull();
    expect(dto.space_id).toBeNull();
  });
});
