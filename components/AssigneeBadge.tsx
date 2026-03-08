import { getDisplayLabel } from "@/lib/display-utils";

interface Props {
  email: string;
  display_name?: string;
  nickname?: string;
  isMe?: boolean;
}

export function AssigneeBadge({ email, display_name, nickname, isMe }: Props) {
  if (isMe) return null;

  const label = getDisplayLabel(email, { display_name, nickname });
  const initial = label[0]?.toUpperCase() ?? "?";

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary/20 text-primary font-medium text-[9px]">
        {initial}
      </span>
      <span>{label}</span>
    </span>
  );
}
