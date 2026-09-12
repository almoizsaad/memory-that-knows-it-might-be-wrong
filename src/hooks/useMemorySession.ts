import { useCallback, useMemo, useState } from "react";
import { extractFact } from "../adapter/extractFacts";
import { confirm as confirmRecordFn, emptyStore, ingest, reject as rejectRecordFn } from "../engine/memoryEngine";
import { revoke as revokeFn, tick } from "../engine/forgetting";
import { retrieve } from "../engine/retrieval";
import type { MemoryRecord, MemoryStoreState, RetrievalResult } from "../engine/types";
import { scenarios, type Scenario, type ScenarioStep } from "../scenarios";

const SUBJECT = "user";

export type LogEntry =
  | { id: string; kind: "note"; text: string }
  | { id: string; kind: "user"; text: string }
  | {
      id: string;
      kind: "write";
      text: string;
      record: MemoryRecord | null;
      conflict: { kind: "explicit" | "implicit"; priorId: string } | null;
    }
  | { id: string; kind: "answer"; question: string; result: RetrievalResult }
  | { id: string; kind: "system"; text: string };

function newState(): MemoryStoreState {
  return emptyStore(new Date().toISOString());
}

let logSeq = 0;
function logId(): string {
  logSeq += 1;
  return `log_${logSeq}`;
}

export function useMemorySession() {
  const [store, setStore] = useState<MemoryStoreState>(newState);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [context, setContext] = useState<"personal" | "work">("personal");
  const [lastAnswerRecordId, setLastAnswerRecordId] = useState<string | null>(null);
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [turnSeq, setTurnSeq] = useState(0);

  const append = useCallback((entry: LogEntry) => setLog((l) => [...l, entry]), []);

  const say = useCallback(
    (text: string, scopeContext?: string) => {
      const turnRef = `turn_${turnSeq + 1}`;
      setTurnSeq((n) => n + 1);
      append({ id: logId(), kind: "user", text });

      const fact = extractFact({ utterance: text, turnRef, subject: SUBJECT });
      if (!fact) {
        append({
          id: logId(),
          kind: "system",
          text: "No storable fact recognized in that — nothing written.",
        });
        return;
      }
      if (scopeContext) fact.scope = { ...fact.scope, context: scopeContext };

      const result = ingest(store, fact);
      setStore(result.state);

      let note = `Wrote "${result.record.content}" (topic: ${result.record.topicKey}, scope: ${result.record.scope.context}, confidence: ${Math.round(result.record.confidence * 100)}%).`;
      if (result.conflict?.kind === "explicit") {
        note += ` This explicitly supersedes an earlier record — the old one is kept, marked superseded, not deleted.`;
      } else if (result.conflict?.kind === "implicit") {
        note += ` This conflicts with an earlier record with no explicit correction — both are now marked "needs verification" instead of picking a winner.`;
      }
      append({ id: logId(), kind: "write", text: note, record: result.record, conflict: result.conflict });
    },
    [append, store, turnSeq],
  );

  const ask = useCallback(
    (text: string, askContext?: string) => {
      append({ id: logId(), kind: "user", text });
      const result = retrieve(store, { text, context: askContext ?? context, subject: SUBJECT });
      setLastAnswerRecordId(result.used[0]?.record.id ?? null);
      append({ id: logId(), kind: "answer", question: text, result });
    },
    [append, store, context],
  );

  const confirmRecord = useCallback(
    (id: string) => {
      const next = confirmRecordFn(store, id);
      setStore(next);
      const rec = next.records.find((r) => r.id === id);
      append({
        id: logId(),
        kind: "system",
        text: `Confirmed. Confidence is now ${Math.round((rec?.confidence ?? 0) * 100)}% and last_confirmed_at was updated.`,
      });
    },
    [append, store],
  );

  const rejectRecord = useCallback(
    (id: string) => {
      const next = rejectRecordFn(store, id);
      setStore(next);
      append({ id: logId(), kind: "system", text: `Marked incorrect and revoked.` });
    },
    [append, store],
  );

  const confirmLast = useCallback(() => {
    if (lastAnswerRecordId) confirmRecord(lastAnswerRecordId);
  }, [confirmRecord, lastAnswerRecordId]);

  const revokeTopic = useCallback(
    (topicKey: string, reason: string) => {
      const result = revokeFn(store, { topicKey, subject: SUBJECT }, reason);
      setStore(result.state);
      append({
        id: logId(),
        kind: "system",
        text: `Revoked ${result.revokedIds.length} record(s) on "${topicKey}": ${result.revokedIds.join(", ")}. They will no longer be used in retrieval, and the inspector shows them as tombstoned, not gone.`,
      });
    },
    [append, store],
  );

  const advanceTime = useCallback(
    (days: number) => {
      const now = new Date(Date.parse(store.now) + days * 86_400_000).toISOString();
      const result = tick(store, now);
      setStore(result.state);
      append({
        id: logId(),
        kind: "system",
        text: `${days} day(s) pass. ${result.expired.length} record(s) expired; ${result.decayed.length} record(s) had their confidence decay from non-confirmation.`,
      });
    },
    [append, store],
  );

  const resetAll = useCallback(() => {
    setStore(newState());
    setLog([]);
    setLastAnswerRecordId(null);
    setActiveScenario(null);
    setStepIndex(0);
    setContext("personal");
  }, []);

  const loadScenario = useCallback(
    (id: string) => {
      const scenario = scenarios.find((s) => s.id === id) ?? null;
      resetAll();
      setActiveScenario(scenario);
    },
    [resetAll],
  );

  const runStep = useCallback(
    (step: ScenarioStep) => {
      switch (step.kind) {
        case "note":
          append({ id: logId(), kind: "note", text: step.text });
          break;
        case "say":
          say(step.text);
          break;
        case "ask":
          setContext(step.context as "personal" | "work");
          ask(step.text, step.context);
          break;
        case "wait":
          advanceTime(step.days);
          break;
        case "confirmLast":
          confirmLast();
          break;
        case "revokeTopic":
          revokeTopic(step.topicKey, step.label);
          break;
      }
    },
    [append, say, ask, advanceTime, confirmLast, revokeTopic],
  );

  const nextScenarioStep = useCallback(() => {
    if (!activeScenario) return;
    const step = activeScenario.steps[stepIndex];
    if (!step) return;
    runStep(step);
    setStepIndex((i) => i + 1);
  }, [activeScenario, stepIndex, runStep]);

  const scenarioDone = activeScenario ? stepIndex >= activeScenario.steps.length : true;

  const visibleRecords = useMemo(
    () => [...store.records].sort((a, b) => Date.parse(b.writtenAt) - Date.parse(a.writtenAt)),
    [store.records],
  );

  return {
    store,
    log,
    context,
    setContext,
    say,
    ask,
    confirmRecord,
    rejectRecord,
    confirmLast,
    revokeTopic,
    advanceTime,
    resetAll,
    scenarios,
    activeScenario,
    loadScenario,
    nextScenarioStep,
    scenarioDone,
    stepIndex,
    visibleRecords,
  };
}
