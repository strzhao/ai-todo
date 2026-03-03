export function TaskSkeleton() {
  return (
    <div className="space-y-0">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-3 px-1 border-b last:border-0 border-border/50">
          <div className="mt-0.5 w-4 h-4 rounded-full bg-muted animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted animate-pulse rounded" style={{ width: `${60 + i * 15}%` }} />
            <div className="flex gap-1.5">
              <div className="h-3 w-6 bg-muted animate-pulse rounded" />
              <div className="h-3 w-12 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
