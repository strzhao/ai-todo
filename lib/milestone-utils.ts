export const MILESTONE_PRESETS = [
  "本周目标",
  "Sprint 目标",
  "版本发布",
  "阶段交付",
] as const;

export function normalizeMilestoneInput(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
