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

// Measured 2026-09-20 on a Fable-orchestrated workload. A delegation costs two
// orchestrator turns plus whatever the sub-agent burns, so it is never free.
const rules = [
  "# Cost-control guardrails (from the guardrails plugin)",
  "",
  "## Tiering",
  "- The orchestrator's own tier never licenses it to do the producing. A more",
  "  expensive orchestrator makes delegation more important, not less.",
  "- A generic sub-agent (general-purpose, or no subagent_type) may not run on a",
  "  top-tier model. A PreToolUse hook enforces this and will deny the call.",
  "- Escalate only after a cheaper tier has actually failed. \"It might be hard\"",
  "  is not a reason.",
  "",
  "## Delegation break-even (measured, in orchestrator tool calls)",
  "- Delegation costs 2 orchestrator turns plus the sub-agent's own burn.",
  "- Delegate a work run longer than ~6 tool calls to a cheap tier.",
  "- A top-tier sub-agent only pays past ~25 tool calls, so it is nearly always",
  "  the wrong choice.",
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
    ? "- A local codex binary is present: send spec-determined implementation to the\n  codex-implementer agent so it draws on a separate subscription."
    : "- No local codex binary in this environment, so the Codex lane is unavailable.\n  Send spec-determined implementation to sonnet instead.",
].join("\n");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: rules,
    },
  })
);
