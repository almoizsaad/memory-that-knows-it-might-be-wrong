import { useMemo, useState } from "react";
import type { MemoryRecord, MemoryStatus } from "../engine/types";
import { RecordCard } from "./RecordCard";

const FILTERS: { id: MemoryStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "needs_verification", label: "Needs verification" },
  { id: "superseded", label: "Superseded" },
  { id: "revoked", label: "Revoked" },
  { id: "expired", label: "Expired" },
];

export function MemoryInspector({
  records,
  now,
  onConfirm,
  onReject,
  onRevokeTopic,
}: {
  records: MemoryRecord[];
  now: string;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onRevokeTopic: (topicKey: string, label: string) => void;
}) {
  const [filter, setFilter] = useState<MemoryStatus | "all">("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of records) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [records]);

  const filtered = filter === "all" ? records : records.filter((r) => r.status === filter);

  const topics = useMemo(
    () => Array.from(new Set(records.filter((r) => r.status !== "revoked").map((r) => r.topicKey))),
    [records],
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-serif text-base text-ink-50">What I remember about you</h3>
        <p className="text-xs text-ink-300 mt-0.5">
          {records.length} record(s) total · {counts.revoked ?? 0} revoked · {counts.needs_verification ?? 0} need
          verification
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              filter === f.id
                ? "border-signal bg-signal/15 text-signal"
                : "border-ink-600 text-ink-300 hover:border-ink-400"
            }`}
          >
            {f.label} {f.id !== "all" && counts[f.id] ? `(${counts[f.id]})` : ""}
          </button>
        ))}
      </div>

      {topics.length > 0 && (
        <div className="rounded-lg border border-ink-600 bg-ink-800/40 p-2.5">
          <p className="text-xs text-ink-300 mb-1.5">Forget everything on a topic:</p>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <button
                key={t}
                onClick={() => onRevokeTopic(t, `User asked to forget everything about "${t}"`)}
                className="text-xs px-2 py-1 rounded-md border border-mem-revoked/30 text-mem-revoked hover:bg-mem-revoked-dim transition-colors font-data"
              >
                {t} ×
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
        {filtered.length === 0 && <p className="text-sm text-ink-400 italic">Nothing in this filter.</p>}
        {filtered.map((r) => (
          <RecordCard
            key={r.id}
            record={r}
            now={now}
            onConfirm={onConfirm}
            onReject={onReject}
            onRevoke={(topicKey) => onRevokeTopic(topicKey, `User asked to forget everything about "${topicKey}"`)}
          />
        ))}
      </div>
    </div>
  );
}
