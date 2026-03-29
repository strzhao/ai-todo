import type { Task } from "./types";

/**
 * Extract #tags from text content.
 * Shared by NoteCard, NotesPage, and SpaceNotes.
 */
export function extractTags(text: string): string[] {
  const matches = text.match(/(?<![#])#([^\s#,，。！？：；]+)/g);
  if (!matches) return [];
  return [...new Set(
    matches.map((m) => m.slice(1).replace(/[.,;:!?。，；：！？、]+$/, ""))
  )].filter(Boolean);
}

/**
 * Group notes by date for display (today / yesterday / date label).
 */
export function groupNotesByDate(notes: Task[]): { label: string; notes: Task[] }[] {
  const groups = new Map<string, Task[]>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const note of notes) {
    const d = new Date(note.created_at);
    d.setHours(0, 0, 0, 0);
    let label: string;
    if (d.getTime() === today.getTime()) {
      label = "今天";
    } else if (d.getTime() === yesterday.getTime()) {
      label = "昨天";
    } else {
      label = d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(note);
  }

  return Array.from(groups, ([label, notes]) => ({ label, notes }));
}
