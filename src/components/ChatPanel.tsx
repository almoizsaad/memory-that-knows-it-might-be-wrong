import { useState } from "react";
import type { LogEntry } from "../hooks/useMemorySession";
import { formatPct } from "../lib/utils";
import { StatusBadge } from "./Badges";

const HEDGE_STYLES: Record<string, string> = {
  direct: "border-mem-active/40 bg-mem-active-dim",
  hedged: "border-mem-verify/40 bg-mem-verify-dim",
  unsure: "border-mem-revoked/40 bg-mem-revoked-dim",
  none_found: "border-ink-600 bg-ink-800/40",
};

const HEDGE_LABEL: Record<string, string> = {
  direct: "confident",
  hedged: "hedged",
  unsure: "I might be wrong",
  none_found: "nothing on file",
};

function AnswerBubble({ entry }: { entry: Extract<LogEntry, { kind: "answer" }> }) {
  const [showSources, setShowSources] = useState(true);
  const { result } = entry;
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${HEDGE_STYLES[result.hedgeLevel]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-data uppercase tracking-wide text-ink-200">
          {HEDGE_LABEL[result.hedgeLevel]}
        </span>
        {(result.used.length > 0 || result.withheld.length > 0) && (
          <button
            onClick={() => setShowSources((s) => !s)}
            className="text-xs text-ink-300 underline decoration-dotted hover:text-ink-100"
          >
            {showSources ? "hide sources" : "show sources"}
          </button>
        )}
      </div>
      <p className="text-sm text-ink-50 leading-snug">{result.answer}</p>

      {showSources && (result.used.length > 0 || result.withheld.length > 0) && (
        <div className="pt-1 border-t border-ink-700/60 space-y-1.5">
          {result.used.map((u) => (
            <div key={u.record.id} className="text-xs font-data text-ink-300 flex items-start gap-1.5">
              <StatusBadge status={u.record.status} />
              <span>
                used {u.record.id} · confidence {formatPct(u.record.confidence)} · {u.matchReason}
              </span>
            </div>
          ))}
          {result.withheld.map((w) => (
            <div key={w.record.id} className="text-xs font-data text-ink-500 flex items-start gap-1.5">
              <span className="opacity-60">withheld</span>
              <span>
                {w.record.id} — {w.reason}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ log }: { log: LogEntry[] }) {
  if (log.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6">
        <p className="text-sm text-ink-400 max-w-sm">
          Pick a scenario on the right, or type a statement below — e.g. &ldquo;I live in Khartoum&rdquo; — and then
          ask about it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-1 py-2 space-y-3">
      {log.map((entry) => {
        switch (entry.kind) {
          case "note":
            return (
              <p key={entry.id} className="text-xs text-ink-400 italic text-center py-1">
                {entry.text}
              </p>
            );
          case "user":
            return (
              <div key={entry.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-signal/15 border border-signal/30 px-3 py-2 text-sm text-ink-50">
                  {entry.text}
                </div>
              </div>
            );
          case "write":
            return (
              <div key={entry.id} className="flex justify-start">
                <div className="max-w-[85%] rounded-lg rounded-tl-sm border border-ink-600 bg-ink-800/60 px-3 py-2 text-xs font-data text-ink-200">
                  {entry.text}
                </div>
              </div>
            );
          case "system":
            return (
              <div key={entry.id} className="flex justify-start">
                <div className="max-w-[85%] rounded-lg rounded-tl-sm border border-ink-600 bg-ink-800/60 px-3 py-2 text-xs text-ink-200">
                  {entry.text}
                </div>
              </div>
            );
          case "answer":
            return (
              <div key={entry.id} className="flex justify-start">
                <div className="max-w-[90%] w-full">
                  <AnswerBubble entry={entry} />
                </div>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
