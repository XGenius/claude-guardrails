#!/usr/bin/env node
// PreToolUse guard on the Agent tool.
//
// Why this exists: CLAUDE_CODE_SUBAGENT_MODEL only decides the tier when nothing
// else assigns one. An explicit `model` on the Agent call outranks it, and on
// 2026-09-20 that override was measured 142 times in one day, 65 of them on
// generic sub-agents. A soft rule in CLAUDE.md did not hold, so this enforces it.
//
// Denies a top-tier model on a GENERIC sub-agent, where the work is almost always
// spec-determined typing that belongs on the Codex lane (a separate subscription)
// or on Sonnet. Named specialist agents are untouched, so fable-advisor and the
// pr-review-toolkit agents keep their own frontmatter model.
//
// Escape hatch: put TIER-JUSTIFIED: <reason> in the prompt to proceed anyway.

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
  const TOP_TIER = /(opus|fable)/;

  if (!GENERIC.has(type) || !TOP_TIER.test(model)) process.exit(0);
  if (/TIER-JUSTIFIED:/i.test(prompt)) process.exit(0);

  // The Codex lane only exists where the binary does. A cloud VM has no
  // /opt/homebrew/bin/codex and no ChatGPT login, so do not send the caller
  // chasing a lane that cannot run there.
  const codex = ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"].some((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });

  const reason = [
    `Blocked: generic sub-agent on "${ti.model}".`,
    "",
    "Route it instead:",
    ...(codex
      ? ["  - spec-determined implementation -> subagent_type: \"codex-implementer\"",
         "    (separate ChatGPT subscription, does not touch the Claude pool)"]
      : ["  - spec-determined implementation -> model: \"sonnet\"",
         "    (no local codex binary here, so the Codex lane is unavailable)"]),
    "  - analysis, tests, routine refactors -> model: \"sonnet\"",
    "  - renames, boilerplate, format conversion -> model: \"haiku\"",
    "",
    "If this genuinely needs the top tier, name the specialist agent instead of a",
    "generic one, or add a line to the prompt starting with TIER-JUSTIFIED: and the",
    "tier-table row that applies (architecture-heavy, concurrency, subtle debugging,",
    "security, accuracy-critical extraction, multi-input synthesis).",
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
