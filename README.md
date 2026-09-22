# claude-guardrails

One source of truth for the Claude Code cost-control harness, so the rules reach
every surface without a copy living in each repo.

## Why this exists

`~/.claude/settings.json`, `~/.claude/CLAUDE.md` and `~/.claude/hooks/` are read
by **local** sessions only. A cloud session (claude.ai/code, or a Desktop Code
session set to the Cloud environment) reads none of them, so the tier guard, the
delegation rules and the model defaults are simply absent there, with no warning.

The obvious fix, committing a `.claude/settings.json` into each repo, does not
survive contact with 27 repos and a config that changes weekly. Those copies
drift, and a drifted guardrail is worse than none because it looks present.

A plugin avoids the copies entirely. Plugins enabled for a claude.ai account are
downloaded into every session's own environment at start, including Cowork and
cloud sessions, so the content lives in exactly one place and no project repo
needs a file.

## What it ships

| File | Role |
|---|---|
| `hooks/subagent-tier-guard.mjs` | `PreToolUse` on `Agent`. On a generic sub-agent: allows `opus` (Opus 5.5, about 1.36x a Sonnet call since its cache reads cost the same as Sonnet's), denies Fable unless the prompt has a `TIER-JUSTIFIED:` line, denies retired Opus pins (Opus 5, 4.x) outright, and denies silent inheritance where no default sub-agent model exists. Names the cheaper route in every denial. Specialist agents pass untouched. |
| `hooks/session-rules.mjs` | `SessionStart`. Emits the tiering and delegation rules as `additionalContext`, which is the only mechanism that carries CLAUDE.md-style rules into a cloud session. |

Both detect whether a local `codex` binary exists and adapt their advice, because
the Codex lane cannot run in a cloud VM and pointing a cloud session at it would
send it chasing a lane that does not exist.

Hook commands reference scripts through `${CLAUDE_PLUGIN_ROOT}`, so there are no
machine-specific paths, and they prepend a PATH covering the cloud VM's Node
(`/opt/node22/bin`) and Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`). That
last part matters: a GUI-launched session does not inherit a shell PATH, and a
hook that cannot find `node` fails **silently** while the tool call proceeds
unguarded.

## Publishing decision, unresolved

Nothing here contains a credential or any business context, and it should stay
that way, so that the public-versus-private question stays low-stakes. Anything
specific to a company, customer, or project belongs in `~/.claude/CLAUDE.md` or
that repo's own `CLAUDE.md`, never in this plugin.

Two routes, not yet chosen:

1. **Public GitHub repo as a marketplace.** Simplest and unambiguous for a cloud
   VM to fetch. Makes this content public.
2. **Upload to claude.ai directly.** claude.ai lists your own uploads as a
   marketplace, which avoids a public repo.

A private marketplace repo that is not one of the session's attached repos is
not documented as authenticating from a cloud VM. Do not rely on it untested.

## Testing a hook the way a GUI app runs it

Not the way your terminal runs it:

```
echo '{"tool_name":"Agent","tool_input":{"subagent_type":"general-purpose","model":"fable","prompt":"x"}}' \
  | env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME="$HOME" CLAUDE_PLUGIN_ROOT="$PWD" \
    sh -c 'PATH="/opt/node22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" node "${CLAUDE_PLUGIN_ROOT}/hooks/subagent-tier-guard.mjs"'
```

Expect `permissionDecision: deny` for `"model":"fable"` and for `"model":"claude-opus-5"`, and no output (allowed) for `"model":"opus"`.

## Relationship to the local harness

This plugin does not replace `~/.claude/settings.json`. Local sessions keep using
it for the model default, `CLAUDE_CODE_SUBAGENT_MODEL`, `autoCompactWindow`, the
plugin list and the Codex lane. This plugin is what carries the portable subset
everywhere else. Once it is enabled, the tier guard in `~/.claude/settings.json`
becomes redundant locally and should be removed to avoid a double hook.
