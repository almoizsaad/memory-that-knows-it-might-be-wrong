import type { MemoryStatus } from "../engine/types";
import { cn, formatPct } from "../lib/utils";

const STATUS_STYLES: Record<MemoryStatus, string> = {
  active: "bg-mem-active-dim text-mem-active border-mem-active/30",
  needs_verification: "bg-mem-verify-dim text-mem-verify border-mem-verify/30",
  superseded: "bg-mem-superseded-dim text-mem-superseded border-mem-superseded/30",
  revoked: "bg-mem-revoked-dim text-mem-revoked border-mem-revoked/30",
  expired: "bg-mem-expired-dim text-mem-expired border-mem-expired/30",
};

const STATUS_LABEL: Record<MemoryStatus, string> = {
  active: "active",
  needs_verification: "needs verification",
  superseded: "superseded",
  revoked: "revoked",
  expired: "expired",
};

export function StatusBadge({ status }: { status: MemoryStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium font-data uppercase tracking-wide",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ConfidenceBar({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.75 ? "bg-mem-active" : confidence >= 0.4 ? "bg-mem-verify" : "bg-mem-revoked";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="h-1.5 flex-1 rounded-full bg-ink-700 overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.round(confidence * 100)}%` }} />
      </div>
      <span className="font-data text-xs text-ink-200 w-9 text-right">{formatPct(confidence)}</span>
    </div>
  );
}

export function ScopeTag({ context }: { context: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-ink-600 bg-ink-700/60 px-2 py-0.5 text-xs font-data text-ink-200">
      scope: {context}
    </span>
  );
}
