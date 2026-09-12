import type { MemoryRecord } from "../engine/types";
import { formatDate, formatRelativeAge } from "../lib/utils";
import { ConfidenceBar, ScopeTag, StatusBadge } from "./Badges";

export function RecordCard({
  record,
  now,
  onConfirm,
  onReject,
  onRevoke,
}: {
  record: MemoryRecord;
  now: string;
  onConfirm?: (id: string) => void;
  onReject?: (id: string) => void;
  onRevoke?: (topicKey: string) => void;
}) {
  const editable = record.status === "active" || record.status === "needs_verification";
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-800/60 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink-50 leading-snug">{record.content}</p>
        <StatusBadge status={record.status} />
      </div>

      <ConfidenceBar confidence={record.confidence} />

      <div className="flex flex-wrap items-center gap-1.5">
        <ScopeTag context={record.scope.context} />
        <span className="inline-flex items-center rounded-md border border-ink-600 bg-ink-700/60 px-2 py-0.5 text-xs font-data text-ink-200">
          {record.type}
        </span>
        <span className="inline-flex items-center rounded-md border border-ink-600 bg-ink-700/60 px-2 py-0.5 text-xs font-data text-ink-200">
          topic: {record.topicKey}
        </span>
      </div>

      <div className="text-xs text-ink-300 space-y-0.5 font-data">
        <div>source: {record.source.kind} — &ldquo;{record.source.quote}&rdquo;</div>
        <div>
          written {formatDate(record.writtenAt)} · last confirmed {formatRelativeAge(record.lastConfirmedAt ?? record.writtenAt, now)}
        </div>
        {record.supersedes && <div>supersedes: {record.supersedes}</div>}
        {record.supersededBy && <div>superseded by: {record.supersededBy}</div>}
        {record.closedReason && <div className="text-mem-revoked">{record.closedReason}</div>}
      </div>

      {editable && (onConfirm || onReject || onRevoke) && (
        <div className="flex gap-2 pt-1">
          {onConfirm && (
            <button
              onClick={() => onConfirm(record.id)}
              className="text-xs px-2 py-1 rounded-md border border-mem-active/40 text-mem-active hover:bg-mem-active-dim transition-colors"
            >
              Confirm
            </button>
          )}
          {onReject && (
            <button
              onClick={() => onReject(record.id)}
              className="text-xs px-2 py-1 rounded-md border border-ink-500 text-ink-200 hover:bg-ink-700 transition-colors"
            >
              Correct / reject
            </button>
          )}
          {onRevoke && (
            <button
              onClick={() => onRevoke(record.topicKey)}
              className="text-xs px-2 py-1 rounded-md border border-mem-revoked/40 text-mem-revoked hover:bg-mem-revoked-dim transition-colors"
            >
              Forget this
            </button>
          )}
        </div>
      )}
    </div>
  );
}
