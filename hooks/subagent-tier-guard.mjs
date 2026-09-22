#!/usr/bin/env node
// PreToolUse guard on the Agent tool.
//
// Why this exists: CLAUDE_CODE_SUBAGENT_MODEL only decides the tier when nothing
// else assigns one. An explicit `model` on the Agent call outranks it, and on
// 2026-09-20 that override was measured 142 times in one day, 65 of them on
// generic sub-agents. A soft rule in CLAUDE.md did not hold, so this enforces it.
//
// What it allows changed with Opus 5.5 (2026-09-22). Opus 5.5 reads cache at
// $0.20/MTok, the same as Sonnet 5, and this workload is ~97% cache reads, so an
// Opus 5.5 sub-agent call costs ~1.36x a Sonnet call (Opus 5 was ~2.5x). That is
// cheap enough to be the right tier for judgment-heavy coding, so the `opus`
// alias (which resolves to Opus 5.5) now passes. What stays blocked on a GENERIC
// sub-agent:
//   - Fable / Mythos: ~2.6x Sonnet per call. Escape hatch: TIER-JUSTIFIED: line.
//   - Explicit pins to retired Opus models (Opus 5, 4.x): no escape hatch; they
//     cost more than Opus 5.5 and do worse.
//   - Silent inheritance when no default sub-agent model exists (cloud
//     sessions), since the orchestrator there may be Fable.
// Named specialist agents are untouched, so fable-advisor and the
// pr-review-toolkit agents keep their own frontmatter model.

import fs from "node:fs";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    process.exit(0); // never block on a parse failure
  }
  if (input.tool_name !== "Agent") process.exit(0);

  const ti = input.tool_input || {};
  const type = String(ti.subagent_type ?? "").trim().toLowerCase();
  const model = String(ti.model ?? "").trim().toLowerCase();
  const prompt = String(ti.prompt ?? "");

  // Generic = no specialist definition behind it, so nothing justifies the tier.
  const GENERIC = new Set(["", "general-purpose", "claude"]);
  if (!GENERIC.has(type)) process.exit(0);

  const PREMIUM = /(fable|mythos)/;
  // claude-opus-5, claude-opus-5[1m], claude-opus-4-8 ... but not claude-opus-5-5.
  const RETIRED_OPUS = /opus-?4|opus-5(?![-.]\d)/;

  // Resolution order: explicit model on the call, else CLAUDE_CODE_SUBAGENT_MODEL,
  // else the sub-agent inherits the orchestrator's tier. A cloud session never
  // reads ~/.claude/settings.json, so there is no default there and an unset
  // model silently inherits whatever the orchestrator runs, possibly Fable.
  const envDefault = String(process.env.CLAUDE_CODE_SUBAGENT_MODEL ?? "")
    .trim()
    .toLowerCase();
  const inherits = !model && !envDefault;
  const effective = model || envDefault;
  const justified = /TIER-JUSTIFIED:/i.test(prompt);

  let headline;
  if (!inherits && RETIRED_OPUS.test(effective)) {
    headline = `Blocked: "${effective}" is a retired Opus model. Use model: "opus", which is Opus 5.5: cheaper and stronger.`;
  } else if (!justified && (inherits || PREMIUM.test(effective))) {
    headline = inherits
      ? "Blocked: generic sub-agent with no model set, and no CLAUDE_CODE_SUBAGENT_MODEL\ndefault in this environment, so it would inherit the orchestrator's tier."
      : `Blocked: generic sub-agent on "${effective}" (~2.6x a Sonnet call).`;
  } else {
    process.exit(0);
  }

  // The Codex lane only exists where the binary does. A cloud VM has no
  // /opt/homebrew/bin/codex and no ChatGPT login, so do not send the caller
  // chasing a lane that cannot run there.
  const codex = ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"].some((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });

  const reason = [
    headline,
    "",
    "Route it instead:",
    ...(codex
      ? ["  - fully specified implementation -> ~/.claude/scripts/codex-run.sh via Bash",
         "    (gpt-6-luna by default, gpt-5.6-terra (stronger) when trickier; uses the ChatGPT",
         "    subscription, and costs the Claude pool only the turns that launch it)"]
      : ["  - fully specified implementation -> model: \"sonnet\"",
         "    (no local codex binary here, so the Codex lane is unavailable)"]),
    "  - judgment-heavy coding (architecture, concurrency, subtle debugging,",
    "    security, or after one failed Sonnet attempt) -> model: \"opus\" (Opus 5.5)",
    "  - analysis, tests, routine refactors -> model: \"sonnet\"",
    "  - renames, boilerplate, format conversion -> model: \"haiku\"",
    "",
    "Fable on a generic sub-agent needs a prompt line starting with TIER-JUSTIFIED:",
    "naming why Opus 5.5 is not enough. Retired Opus pins have no escape hatch.",
  ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
});
