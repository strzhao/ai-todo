"use client";

import { Button } from "@/components/ui/button";

interface Props {
  text: string;
  subtext?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ text, subtext, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl mb-3">✓</div>
      <p className="text-sm font-medium text-foreground">{text}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
      {action && (
        <Button size="sm" variant="outline" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
