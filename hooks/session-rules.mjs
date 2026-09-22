#!/usr/bin/env node
// SessionStart hook: inject the cost-control rules into every session.
//
// This is the portable half of the harness. A cloud or Cowork session does not
// read ~/.claude/CLAUDE.md, so rules that live only there simply do not exist
// off this machine. Emitting them as additionalContext from a synced plugin is
// the one mechanism that reaches every surface.
//
// Deliberately GENERIC: no business context, no customer or project names, no
// credentials. This file is safe to publish. Anything specific to a company or
// a customer belongs in ~/.claude/CLAUDE.md or a repo's own CLAUDE.md, never
// here, because a plugin may be distributed publicly.

import fs from "node:fs";

const hasCodex = ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"].some((p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
});

// Measured 2026-09-20, re-priced 2026-09-22 for Opus 5.5. Opus 5.5 reads cache
// at $0.20/MTok, the same as Sonnet 5, and this workload is ~97% cache reads, so
// an Opus 5.5 call costs ~1.36x a Sonnet call (Opus 5 was ~2.5x, Fable ~2.6x).
const rules = [
  "# Cost-control guardrails (from the guardrails plugin)",
  "",
  "## Orchestrator (this plugin cannot set it, so it is stated here)",
  "- A plugin cannot choose the session model. Locally it comes from",
  "  ~/.claude/settings.json; in a cloud or Cowork session it comes from that",
  "  surface's own model picker, which this plugin never sees.",
  "- Default the orchestrator to Opus 5.5 (the `opus` alias). It is cheaper than",
  "  Fable on every token class. Choose Fable only for a specific reason.",
  "- If this session is running on Fable, or on a retired Opus (Opus 5, 4.x),",
  "  without a specific reason, say so once and let the user decide.",
  "",
  "## Routing (per call, relative to Sonnet 5 = 1.00x)",
  "- Fully specified typing -> the Codex lane (below), not a Claude sub-agent.",
  "- Judgment-heavy coding (architecture, concurrency, subtle debugging,",
  "  security) -> model: \"opus\" (Opus 5.5, ~1.36x). Also after ONE failed",
  "  Sonnet attempt: at 1.36x, Opus pays for itself once Sonnet's redo rate",
  "  passes roughly 1 in 4.",
  "- Analysis, tests, routine refactors -> model: \"sonnet\".",
  "- Renames, boilerplate, format conversion -> model: \"haiku\".",
  "- Fable (~2.6x) on a generic sub-agent is blocked by a PreToolUse hook unless",
  "  the prompt carries a TIER-JUSTIFIED: line. Retired Opus pins are blocked.",
  "- The orchestrator's own tier never licenses it to do the producing.",
  "",
  "## Delegation break-even (in orchestrator tool calls)",
  "- Delegation costs 2 orchestrator turns plus the sub-agent's own burn.",
  "- Delegate a work run longer than ~6 tool calls to a cheaper lane.",
  "- Batch independent tool calls into one turn before reaching for a delegation;",
  "  it is strictly cheaper and needs no round trip.",
  "",
  "## Never delegate",
  "- Talking to the user.",
  "- A ruling that resolves a conflict between two authorities.",
  "- The final pre-merge review.",
  "- Orientation reads whose result decides the very next step.",
  "  Delegating a decision just relocates it and costs a round trip.",
  "",
  "## Implementation lane",
  hasCodex
    ? "- A local codex binary is present. Run fully specified implementation with\n  ~/.claude/scripts/codex-run.sh from the orchestrator's own Bash (no Claude\n  supervisor agent): gpt-6-luna at max effort for well-structured, bounded\n  tasks (the default), gpt-6-sol for more complex tasks. It draws on a\n  separate subscription, which is what keeps the Claude pool alive.\n  If it reports STATUS: unavailable, fall back to model: \"sonnet\" and say so."
    : "- No local codex binary in this environment, so the Codex lane is unavailable.\n  Send fully specified implementation to model: \"sonnet\" instead.",
].join("\n");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: rules,
    },
  })
);
