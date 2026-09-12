/**
 * Runs every scenario straight through the engine (no UI, no adapter
 * ambiguity hidden behind buttons) and prints what happened at each step.
 * `npm run memories` — useful for a reviewer who wants to see write /
 * retrieve / forget actually execute before opening the app.
 */
import { extractFact } from "../src/adapter/extractFacts";
import { confirm, emptyStore, ingest } from "../src/engine/memoryEngine";
import { revoke, tick } from "../src/engine/forgetting";
import { retrieve } from "../src/engine/retrieval";
import type { MemoryStoreState } from "../src/engine/types";
import { scenarios } from "../src/scenarios";

const SUBJECT = "user";

function line(char = "─", n = 60) {
  console.log(char.repeat(n));
}

function runScenario(state: MemoryStoreState, scenarioId: string): MemoryStoreState {
  const scenario = scenarios.find((s) => s.id === scenarioId)!;
  line("═");
  console.log(`SCENARIO: ${scenario.title}`);
  console.log(scenario.subtitle);
  line("═");

  let turn = 0;
  let lastUsedId: string | null = null;

  for (const step of scenario.steps) {
    switch (step.kind) {
      case "note":
        console.log(`  · ${step.text}`);
        break;

      case "say": {
        turn += 1;
        const fact = extractFact({ utterance: step.text, turnRef: `turn_${turn}`, subject: SUBJECT });
        console.log(`\n  USER SAYS: "${step.text}"`);
        if (!fact) {
          console.log("    (no storable fact recognized)");
          break;
        }
        const result = ingest(state, fact);
        state = result.state;
        console.log(
          `    -> wrote ${result.record.id} "${result.record.content}" ` +
            `[${result.record.status}, confidence ${(result.record.confidence * 100).toFixed(0)}%, scope ${result.record.scope.context}]`,
        );
        if (result.conflict) {
          console.log(`    -> ${result.conflict.kind.toUpperCase()} conflict with ${result.conflict.priorId}`);
        }
        break;
      }

      case "ask": {
        console.log(`\n  USER ASKS (${step.context}): "${step.text}"`);
        const result = retrieve(state, { text: step.text, context: step.context, subject: SUBJECT });
        lastUsedId = result.used[0]?.record.id ?? null;
        console.log(`    [${result.hedgeLevel.toUpperCase()}] ${result.answer}`);
        for (const w of result.withheld) {
          console.log(`    (withheld ${w.record.id}: ${w.reason})`);
        }
        break;
      }

      case "wait": {
        const now = new Date(Date.parse(state.now) + step.days * 86_400_000).toISOString();
        const result = tick(state, now);
        state = result.state;
        console.log(`\n  ⏭ ${step.days} days pass (now ${now.slice(0, 10)})`);
        console.log(`    -> ${result.expired.length} expired, ${result.decayed.length} decayed`);
        break;
      }

      case "confirmLast": {
        if (!lastUsedId) break;
        state = confirm(state, lastUsedId);
        const rec = state.records.find((r) => r.id === lastUsedId)!;
        console.log(`\n  USER CONFIRMS -> ${rec.id} confidence now ${(rec.confidence * 100).toFixed(0)}%`);
        break;
      }

      case "revokeTopic": {
        const result = revoke(state, { topicKey: step.topicKey, subject: SUBJECT }, step.label);
        state = result.state;
        console.log(`\n  USER REVOKES topic "${step.topicKey}": ${step.label}`);
        console.log(`    -> revoked ${result.revokedIds.length}: ${result.revokedIds.join(", ")}`);
        break;
      }
    }
  }

  console.log();
  return state;
}

for (const scenario of scenarios) {
  runScenario(emptyStore(new Date().toISOString()), scenario.id);
}

line("═");
console.log(`Done. Run the actual UI with \`npm run dev\` for the interactive version.`);
