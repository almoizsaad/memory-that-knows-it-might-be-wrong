import type { Scenario } from "../scenarios";

export function ScenarioPicker({
  scenarios,
  active,
  stepIndex,
  scenarioDone,
  onLoad,
  onNext,
}: {
  scenarios: Scenario[];
  active: Scenario | null;
  stepIndex: number;
  scenarioDone: boolean;
  onLoad: (id: string) => void;
  onNext: () => void;
}) {
  const core = scenarios.filter((s) => s.category === "core");
  const failures = scenarios.filter((s) => s.category === "failure");

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-serif text-base text-ink-50 mb-2">Core demo</h3>
        <div className="space-y-1.5">
          {core.map((s) => (
            <ScenarioButton key={s.id} scenario={s} isActive={active?.id === s.id} onClick={() => onLoad(s.id)} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-serif text-base text-ink-50 mb-2">Failure tests</h3>
        <div className="space-y-1.5">
          {failures.map((s) => (
            <ScenarioButton key={s.id} scenario={s} isActive={active?.id === s.id} onClick={() => onLoad(s.id)} />
          ))}
        </div>
      </div>

      {active && (
        <div className="rounded-lg border border-signal/30 bg-signal/10 p-3 space-y-2">
          <p className="text-xs text-ink-200">
            Step {Math.min(stepIndex + 1, active.steps.length)} / {active.steps.length}
          </p>
          <button
            onClick={onNext}
            disabled={scenarioDone}
            className="w-full text-sm px-3 py-1.5 rounded-md bg-signal text-ink-950 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-signal/90 transition-colors"
          >
            {scenarioDone ? "Scenario complete" : "Play next step →"}
          </button>
        </div>
      )}
    </div>
  );
}

function ScenarioButton({
  scenario,
  isActive,
  onClick,
}: {
  scenario: Scenario;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
        isActive ? "border-signal bg-signal/10" : "border-ink-600 bg-ink-800/40 hover:border-ink-400"
      }`}
    >
      <p className="text-sm text-ink-50">{scenario.title}</p>
      <p className="text-xs text-ink-300 mt-0.5">{scenario.subtitle}</p>
    </button>
  );
}
