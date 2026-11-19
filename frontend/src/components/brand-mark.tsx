import { Waves } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandMark({
  inverse = false,
  compact = false,
}: {
  inverse?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-2xl",
          inverse ? "bg-white/10 text-white" : "bg-primary text-primary-foreground",
        )}
      >
        <Waves aria-hidden="true" className="size-6" strokeWidth={2.2} />
      </div>
      <div>
        <p
          className={cn(
            "font-semibold tracking-tight",
            inverse ? "text-white" : "text-foreground",
            compact ? "text-sm" : "text-base",
          )}
        >
          Community Washing Bay
        </p>
        <p
          className={cn(
            "mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]",
            inverse ? "text-white/60" : "text-muted-foreground",
          )}
        >
          Business management
        </p>
      </div>
    </div>
  );
}
