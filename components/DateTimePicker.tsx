"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  extractTime,
  extractDate,
  combineDateTimeISO,
  getDaysInMonth,
  getFirstDayOfMonth,
  getDefaultTime,
  type DateField,
} from "@/lib/date-utils";

interface DateTimePickerProps {
  value?: string;
  onChange: (value: string | null) => void;
  field?: DateField;
  showTime?: boolean;
  children: React.ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function DateTimePicker({
  value,
  onChange,
  field = "due_date",
  showTime = true,
  children,
  side = "bottom",
  align = "start",
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  // Current viewing month
  const now = new Date();
  const extracted = extractDate(value);
  const [viewYear, setViewYear] = useState(extracted?.year ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(extracted?.month ?? now.getMonth());

  // Selected date
  const [selectedDate, setSelectedDate] = useState<{ year: number; month: number; day: number } | null>(
    extracted,
  );

  // Time
  const existingTime = value ? extractTime(value) : null;
  const defaults = getDefaultTime(field);
  const [hour, setHour] = useState(existingTime?.hour ?? defaults.hour);
  const [minute, setMinute] = useState(existingTime?.minute ?? defaults.minute);

  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  // Sync state when value changes externally
  useEffect(() => {
    const ext = extractDate(value);
    if (ext) {
      setSelectedDate(ext);
      setViewYear(ext.year);
      setViewMonth(ext.month);
    } else {
      setSelectedDate(null);
    }
    const t = value ? extractTime(value) : null;
    if (t) {
      setHour(t.hour);
      setMinute(t.minute);
    }
  }, [value]);

  const emitChange = useCallback((
    date: { year: number; month: number; day: number },
    h: number,
    m: number,
  ) => {
    onChange(combineDateTimeISO(date.year, date.month, date.day, h, m));
  }, [onChange]);

  function handleDayClick(day: number) {
    const newDate = { year: viewYear, month: viewMonth, day };
    setSelectedDate(newDate);
    emitChange(newDate, hour, minute);
  }

  function handleTimeBlur() {
    if (!selectedDate) return;
    emitChange(selectedDate, hour, minute);
  }

  function handleHourChange(val: string) {
    const n = Math.max(0, Math.min(23, parseInt(val) || 0));
    setHour(n);
  }

  function handleMinuteChange(val: string) {
    const n = Math.max(0, Math.min(59, parseInt(val) || 0));
    setMinute(n);
  }

  function handleHourKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") { e.preventDefault(); setHour((h) => (h + 1) % 24); }
    if (e.key === "ArrowDown") { e.preventDefault(); setHour((h) => (h - 1 + 24) % 24); }
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); minuteRef.current?.focus(); minuteRef.current?.select(); }
    if (e.key === "Enter") { handleTimeBlur(); }
  }

  function handleMinuteKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") { e.preventDefault(); setMinute((m) => (m + 5) % 60); }
    if (e.key === "ArrowDown") { e.preventDefault(); setMinute((m) => (m - 5 + 60) % 60); }
    if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); hourRef.current?.focus(); hourRef.current?.select(); }
    if (e.key === "Enter") { handleTimeBlur(); }
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  function quickSet(preset: "today" | "tomorrow" | "next_monday") {
    const d = new Date();
    if (preset === "tomorrow") d.setDate(d.getDate() + 1);
    if (preset === "next_monday") {
      const dow = d.getDay();
      const daysUntilMon = dow === 0 ? 1 : 8 - dow;
      d.setDate(d.getDate() + daysUntilMon);
    }
    const defaults2 = getDefaultTime(field);
    const h = defaults2.hour;
    const m = defaults2.minute;
    const newDate = { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
    setSelectedDate(newDate);
    setViewYear(newDate.year);
    setViewMonth(newDate.month);
    setHour(h);
    setMinute(m);
    onChange(combineDateTimeISO(newDate.year, newDate.month, newDate.day, h, m));
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setSelectedDate(null);
    setOpen(false);
  }

  // Build calendar grid
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDow = getFirstDayOfMonth(viewYear, viewMonth);
  const todayDate = now; // reuse the Date created at render start

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = `${viewYear}年${viewMonth + 1}月`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className="w-[280px] p-0"
      >
        {/* Month navigation */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <button
            onClick={prevMonth}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="上个月"
          >
            ◀
          </button>
          <span className="text-sm font-medium text-foreground">{monthLabel}</span>
          <button
            onClick={nextMonth}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="下个月"
          >
            ▶
          </button>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 px-3">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[11px] text-muted-foreground py-1 font-medium">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 px-3 pb-2">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`empty-${i}`} />;
            }

            const isCellToday =
              viewYear === todayDate.getFullYear() &&
              viewMonth === todayDate.getMonth() &&
              day === todayDate.getDate();

            const isSelected =
              selectedDate &&
              viewYear === selectedDate.year &&
              viewMonth === selectedDate.month &&
              day === selectedDate.day;

            return (
              <button
                key={day}
                onClick={() => handleDayClick(day)}
                className={`
                  w-9 h-9 flex items-center justify-center rounded-md text-sm transition-colors
                  ${isSelected
                    ? "bg-sage text-white font-medium"
                    : isCellToday
                      ? "bg-sage-mist text-sage font-medium hover:bg-sage/20"
                      : "text-foreground hover:bg-muted"
                  }
                `}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Time input */}
        {showTime && (
          <div className="border-t border-border/50 px-3 py-2.5 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">🕐</span>
            <input
              ref={hourRef}
              type="text"
              inputMode="numeric"
              value={String(hour).padStart(2, "0")}
              onChange={(e) => handleHourChange(e.target.value)}
              onBlur={handleTimeBlur}
              onKeyDown={handleHourKeyDown}
              onFocus={(e) => e.target.select()}
              className="w-9 h-7 text-center text-sm bg-muted/40 border border-border/60 rounded-md outline-none focus:border-sage focus:ring-1 focus:ring-sage/20 transition-colors"
              maxLength={2}
            />
            <span className="text-sm text-muted-foreground font-medium">:</span>
            <input
              ref={minuteRef}
              type="text"
              inputMode="numeric"
              value={String(minute).padStart(2, "0")}
              onChange={(e) => handleMinuteChange(e.target.value)}
              onBlur={handleTimeBlur}
              onKeyDown={handleMinuteKeyDown}
              onFocus={(e) => e.target.select()}
              className="w-9 h-7 text-center text-sm bg-muted/40 border border-border/60 rounded-md outline-none focus:border-sage focus:ring-1 focus:ring-sage/20 transition-colors"
              maxLength={2}
            />
          </div>
        )}

        {/* Quick buttons */}
        <div className="border-t border-border/50 px-3 py-2 flex items-center gap-1.5">
          <button
            onClick={() => quickSet("today")}
            className="text-xs px-2 py-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            今天
          </button>
          <button
            onClick={() => quickSet("tomorrow")}
            className="text-xs px-2 py-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            明天
          </button>
          <button
            onClick={() => quickSet("next_monday")}
            className="text-xs px-2 py-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            下周一
          </button>
          <div className="flex-1" />
          <button
            onClick={handleClear}
            className="text-xs px-2 py-1 rounded-md text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            清除
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
