"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { TaskMember } from "@/lib/types";
import { getDisplayLabel } from "@/lib/display-utils";
import { getRecentAssignees, addRecentAssignee } from "@/lib/assignee-utils";

interface AssigneePickerProps {
  members: TaskMember[];
  currentEmail: string | null | undefined;
  onSelect: (email: string) => void; // "" = unassign
  spaceId: string;
  variant: "detail" | "inline";
  readonly?: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────

export function AssigneePicker({
  members,
  currentEmail,
  onSelect,
  spaceId,
  variant,
  readonly = false,
}: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [openAbove, setOpenAbove] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | HTMLSpanElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ─── Derived display ────────────────────────────────────────────────
  const currentMember = currentEmail
    ? members.find((m) => m.email === currentEmail)
    : undefined;
  const currentLabel = currentEmail
    ? getDisplayLabel(currentEmail, currentMember)
    : null;

  // ─── Build sorted member list ───────────────────────────────────────
  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "active"),
    [members],
  );

  const sortedItems = useMemo(() => {
    const recent = getRecentAssignees(spaceId);

    // "未指派" is always first — represented as empty email
    const items: Array<{ email: string; label: string; isCurrent: boolean }> = [
      { email: "", label: "未指派", isCurrent: !currentEmail },
    ];

    // Currently selected member (if any)
    if (currentEmail) {
      const cm = activeMembers.find((m) => m.email === currentEmail);
      if (cm) {
        items.push({
          email: cm.email,
          label: getDisplayLabel(cm.email, cm),
          isCurrent: true,
        });
      }
    }

    // Recently used (active, not current)
    const addedEmails = new Set(items.map((i) => i.email));
    for (const email of recent) {
      if (addedEmails.has(email)) continue;
      const m = activeMembers.find((am) => am.email === email);
      if (!m) continue;
      items.push({
        email: m.email,
        label: getDisplayLabel(m.email, m),
        isCurrent: false,
      });
      addedEmails.add(email);
    }

    // Remaining active members sorted by label
    const remaining = activeMembers
      .filter((m) => !addedEmails.has(m.email))
      .map((m) => ({
        email: m.email,
        label: getDisplayLabel(m.email, m),
        isCurrent: false,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    items.push(...remaining);
    return items;
  }, [activeMembers, currentEmail, spaceId]);

  // ─── Filtered list ──────────────────────────────────────────────────
  const filteredItems = search.trim()
    ? sortedItems.filter((item) => {
        if (item.email === "") return true; // always show "未指派"
        const q = search.toLowerCase();
        const m = activeMembers.find((am) => am.email === item.email);
        return (
          item.label.toLowerCase().includes(q) ||
          item.email.toLowerCase().includes(q) ||
          (m?.display_name ?? "").toLowerCase().includes(q) ||
          (m?.nickname ?? "").toLowerCase().includes(q)
        );
      })
    : sortedItems;

  // ─── Direction detection ────────────────────────────────────────────
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const bottomSpace = window.innerHeight - rect.bottom;
    setOpenAbove(bottomSpace < 200);
  }, [open]);

  // ─── Auto-focus search input ────────────────────────────────────────
  useEffect(() => {
    if (open) {
      // Small delay to ensure DOM is mounted
      const t = setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ─── Reset state when panel closes ──────────────────────────────────
  useEffect(() => {
    if (!open) {
      setSearch("");
      setHighlightIdx(-1);
    }
  }, [open]);

  // ─── Click outside ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ─── Selection handler ──────────────────────────────────────────────
  const handleSelect = useCallback(
    (email: string) => {
      addRecentAssignee(spaceId, email);
      onSelect(email);
      setOpen(false);
    },
    [spaceId, onSelect],
  );

  // ─── Keyboard handler ───────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation(); // prevent TaskItem row handlers

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < filteredItems.length) {
        handleSelect(filteredItems[highlightIdx].email);
      }
      return;
    }

    // When panel is above, visual "down" in the list = ArrowUp key, and vice versa
    const isDown = openAbove ? e.key === "ArrowUp" : e.key === "ArrowDown";
    const isUp = openAbove ? e.key === "ArrowDown" : e.key === "ArrowUp";

    if (isDown) {
      e.preventDefault();
      setHighlightIdx((prev) => (prev + 1) % filteredItems.length);
    } else if (isUp) {
      e.preventDefault();
      setHighlightIdx((prev) =>
        prev <= 0 ? filteredItems.length - 1 : prev - 1,
      );
    }
  }

  // ─── Readonly mode ──────────────────────────────────────────────────
  if (readonly) {
    if (variant === "detail") {
      return (
        <span className="text-sm text-foreground">
          {currentLabel ?? "未指派"}
        </span>
      );
    }
    // inline readonly — just show label
    return currentLabel ? (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-sage/20 text-sage font-medium text-[9px]">
          {currentLabel[0]?.toUpperCase()}
        </span>
        <span>{currentLabel}</span>
      </span>
    ) : null;
  }

  // ─── Search input element ───────────────────────────────────────────
  const searchInput = (
    <input
      ref={searchInputRef}
      value={search}
      onChange={(e) => {
        setSearch(e.target.value);
        setHighlightIdx(-1);
      }}
      onKeyDown={handleKeyDown}
      placeholder="搜索成员..."
      className={`w-full px-3 py-1.5 text-xs bg-transparent outline-none placeholder:text-muted-foreground/40 ${
        openAbove
          ? "border-t border-border/50"
          : "border-b border-border/50"
      }`}
    />
  );

  // ─── Member list element ────────────────────────────────────────────
  const memberList = (
    <div className="max-h-[180px] overflow-y-auto py-0.5">
      {filteredItems.map((item, idx) => (
        <button
          key={item.email || "__unassign__"}
          onClick={() => handleSelect(item.email)}
          onMouseEnter={() => setHighlightIdx(idx)}
          className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs transition-colors ${
            item.isCurrent
              ? "font-medium text-sage bg-muted/50"
              : "text-foreground"
          } ${
            highlightIdx === idx ? "bg-muted" : "hover:bg-muted"
          }`}
        >
          {item.email ? (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sage/15 text-sage font-medium text-[10px]">
              {item.label[0]?.toUpperCase()}
            </span>
          ) : null}
          {item.label}
        </button>
      ))}
      {filteredItems.length === 0 && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground/50">
          无匹配成员
        </div>
      )}
    </div>
  );

  // ─── Panel ──────────────────────────────────────────────────────────
  const panel = open ? (
    <div
      className={`absolute z-50 bg-background border border-border rounded-md shadow-lg py-1 ${
        variant === "detail" ? "w-[200px]" : "min-w-[160px]"
      } ${
        openAbove ? "bottom-full mb-1" : "top-full mt-1"
      } left-0`}
    >
      {openAbove ? (
        <>
          {memberList}
          {searchInput}
        </>
      ) : (
        <>
          {searchInput}
          {memberList}
        </>
      )}
    </div>
  ) : null;

  // ─── Variant: detail ────────────────────────────────────────────────
  if (variant === "detail") {
    return (
      <div className="relative" ref={containerRef}>
        <button
          ref={triggerRef as React.RefObject<HTMLButtonElement>}
          className="text-sm text-foreground hover:text-sage transition-colors flex items-center gap-1.5"
          onClick={() => setOpen((v) => !v)}
        >
          {currentEmail ? (
            <>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sage/15 text-sage text-xs font-medium">
                {(currentLabel ?? "?")[0]?.toUpperCase()}
              </span>
              <span>{currentLabel}</span>
            </>
          ) : (
            <span className="text-muted-foreground/50">未指派</span>
          )}
        </button>
        {panel}
      </div>
    );
  }

  // ─── Variant: inline ────────────────────────────────────────────────
  return (
    <div className="relative" ref={containerRef}>
      {currentEmail ? (
        <span
          ref={triggerRef as React.RefObject<HTMLSpanElement>}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer hover:opacity-70 transition-opacity"
          onClick={() => setOpen((v) => !v)}
          title="点击修改负责人"
        >
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-sage/20 text-sage font-medium text-[9px]">
            {(currentLabel ?? "?")[0]?.toUpperCase()}
          </span>
          <span>{currentLabel}</span>
        </span>
      ) : (
        <span
          ref={triggerRef as React.RefObject<HTMLSpanElement>}
          className="text-xs text-muted-foreground/30 cursor-pointer hover:text-muted-foreground/60 transition-colors"
          onClick={() => setOpen((v) => !v)}
          title="指派负责人"
        >
          +@
        </span>
      )}
      {panel}
    </div>
  );
}
