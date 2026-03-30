/**
 * Assignee picker utilities — localStorage recent-list management and member sorting.
 */

import { getDisplayLabel } from "@/lib/display-utils";

// ─── Recent assignees (localStorage) ──────────────────────────────────

export function getRecentAssignees(spaceId: string): string[] {
  try {
    const raw = localStorage.getItem(`assignee_recent_${spaceId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentAssignee(spaceId: string, email: string): void {
  if (!email) return;
  try {
    const list = getRecentAssignees(spaceId);
    const updated = [email, ...list.filter((e) => e !== email)].slice(0, 5);
    localStorage.setItem(
      `assignee_recent_${spaceId}`,
      JSON.stringify(updated),
    );
  } catch {
    // private browsing or quota — silently ignore
  }
}

// ─── Member sorting ───────────────────────────────────────────────────

interface SortableMember {
  email: string;
  display_name?: string;
  nickname?: string;
  status?: string;
}

/**
 * Sort members for the assignee picker panel.
 *
 * Order:
 *  1. "未指派" (empty email)
 *  2. Currently selected member (if any)
 *  3. Recently used members (active, not current)
 *  4. Remaining active members sorted alphabetically by display label
 *
 * Inactive members are appended at the end (not in the recent section).
 */
export function sortMembers<T extends SortableMember>(
  members: T[],
  currentEmail: string | undefined,
  spaceId: string,
): Array<T & { email: string }> {
  const recent = getRecentAssignees(spaceId);
  const activeMembers = members.filter((m) => m.status === "active");
  const inactiveMembers = members.filter((m) => m.status !== "active");

  // Start with "未指派"
  const items: Array<T & { email: string }> = [
    { email: "" } as T & { email: string },
  ];

  const addedEmails = new Set([""]);

  // Currently selected member
  if (currentEmail) {
    const cm = activeMembers.find((m) => m.email === currentEmail);
    if (cm) {
      items.push(cm);
      addedEmails.add(currentEmail);
    }
  }

  // Recently used (active only, not current)
  for (const email of recent) {
    if (addedEmails.has(email)) continue;
    const m = activeMembers.find((am) => am.email === email);
    if (!m) continue;
    items.push(m);
    addedEmails.add(email);
  }

  // Remaining active members sorted alphabetically
  const remaining = activeMembers
    .filter((m) => !addedEmails.has(m.email))
    .sort((a, b) =>
      getDisplayLabel(a.email, a).localeCompare(
        getDisplayLabel(b.email, b),
      ),
    );
  items.push(...remaining);

  // Inactive members at the end
  for (const m of inactiveMembers) {
    if (!addedEmails.has(m.email)) {
      items.push(m);
      addedEmails.add(m.email);
    }
  }

  return items;
}
