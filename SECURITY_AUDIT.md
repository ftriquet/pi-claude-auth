# Security audit

Audited on 2026-06-22 before installing as a pi extension.

## Scope

Reviewed TypeScript source, package scripts, GitHub workflows, and install behavior.

## Findings

- No npm lifecycle install hooks are present.
- No non-Anthropic network destinations were found in runtime source.
- Runtime credential reads are limited to Claude Code storage:
    - macOS Keychain services named `Claude Code-credentials*`
    - `~/.claude/.credentials.json` fallback
- Runtime credential writes are limited to:
    - `~/.pi/agent/auth.json`
    - Claude Code credential storage after OAuth refresh
- Debug logging is opt-in via `PI_CLAUDE_AUTH_DEBUG`; tokens are redacted.
- Production dependency audit reports no known vulnerabilities.

## Hardening applied

- Replaced shell-based `security` invocations with `execFileSync` argument arrays.
- Replaced shell-based Claude CLI fallback invocation with `execFileSync` argument arrays.
- Renamed package metadata and repository references to the fork owner.

## Commands

```sh
corepack pnpm audit --prod
corepack pnpm test
corepack pnpm run build
corepack pnpm run lint
```

All passed at audit time.
