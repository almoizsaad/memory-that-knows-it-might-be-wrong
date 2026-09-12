import { useState, type FormEvent } from "react";
import { useMemorySession } from "./hooks/useMemorySession";
import { ChatPanel } from "./components/ChatPanel";
import { ScenarioPicker } from "./components/ScenarioPicker";
import { MemoryInspector } from "./components/MemoryInspector";

type Tab = "scenarios" | "inspector";

export default function App() {
  const {
    store,
    log,
    context,
    setContext,
    say,
    ask,
    confirmRecord,
    rejectRecord,
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
  } = useMemorySession();

  const [tab, setTab] = useState<Tab>("scenarios");
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"say" | "ask">("say");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (mode === "say") say(text);
    else ask(text, context);
    setInput("");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink-700 px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-ink-50">Memory That Knows It Might Be Wrong</h1>
          <p className="text-xs text-ink-300 mt-0.5">
            Every fact carries source, confidence, freshness, and scope. Every answer shows its work.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => advanceTime(30)}
            className="text-xs px-3 py-1.5 rounded-md border border-ink-600 text-ink-200 hover:border-ink-400 transition-colors font-data"
          >
            ⏭ Fast-forward 30 days
          </button>
          <button
            onClick={resetAll}
            className="text-xs px-3 py-1.5 rounded-md border border-ink-600 text-ink-300 hover:border-mem-revoked/50 hover:text-mem-revoked transition-colors"
          >
            Reset
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0 overflow-hidden">
        <section className="flex flex-col border-r border-ink-700 min-h-[60vh]">
          <ChatPanel log={log} />

          <form onSubmit={handleSubmit} className="border-t border-ink-700 p-3 space-y-2">
            <div className="flex gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setMode("say")}
                className={`px-2.5 py-1 rounded-md border ${mode === "say" ? "border-signal text-signal bg-signal/10" : "border-ink-600 text-ink-300"}`}
              >
                Say (write)
              </button>
              <button
                type="button"
                onClick={() => setMode("ask")}
                className={`px-2.5 py-1 rounded-md border ${mode === "ask" ? "border-signal text-signal bg-signal/10" : "border-ink-600 text-ink-300"}`}
              >
                Ask (retrieve)
              </button>
              <div className="flex-1" />
              <label className="flex items-center gap-1.5 text-ink-300">
                context:
                <select
                  value={context}
                  onChange={(e) => setContext(e.target.value as "personal" | "work")}
                  className="bg-ink-800 border border-ink-600 rounded-md px-1.5 py-0.5 text-ink-100"
                >
                  <option value="personal">personal</option>
                  <option value="work">work</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={mode === "say" ? 'e.g. "I live in Khartoum."' : 'e.g. "What\'s my address?"'}
                className="flex-1 bg-ink-800 border border-ink-600 rounded-md px-3 py-2 text-sm text-ink-50 placeholder:text-ink-400 focus:border-signal outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-signal text-ink-950 text-sm font-medium hover:bg-signal/90 transition-colors"
              >
                Send
              </button>
            </div>
          </form>
        </section>

        <aside className="p-4 overflow-y-auto">
          <div className="flex gap-1.5 mb-4">
            <button
              onClick={() => setTab("scenarios")}
              className={`flex-1 text-xs px-3 py-1.5 rounded-md border ${tab === "scenarios" ? "border-signal text-signal bg-signal/10" : "border-ink-600 text-ink-300"}`}
            >
              Scenarios
            </button>
            <button
              onClick={() => setTab("inspector")}
              className={`flex-1 text-xs px-3 py-1.5 rounded-md border ${tab === "inspector" ? "border-signal text-signal bg-signal/10" : "border-ink-600 text-ink-300"}`}
            >
              Memory inspector
            </button>
          </div>

          {tab === "scenarios" ? (
            <ScenarioPicker
              scenarios={scenarios}
              active={activeScenario}
              stepIndex={stepIndex}
              scenarioDone={scenarioDone}
              onLoad={loadScenario}
              onNext={nextScenarioStep}
            />
          ) : (
            <MemoryInspector
              records={visibleRecords}
              now={store.now}
              onConfirm={confirmRecord}
              onReject={rejectRecord}
              onRevokeTopic={revokeTopic}
            />
          )}
        </aside>
      </main>
    </div>
  );
}
