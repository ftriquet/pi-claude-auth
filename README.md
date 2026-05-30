# pi-claude-auth

Self-contained Anthropic auth for the [pi coding agent](https://pi.dev) using
your existing Claude Code credentials — no separate login or API key needed.

## How it works

This is a pi [extension](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
(packaged as a pi package) that sources Anthropic credentials from Claude Code
instead of asking you to log in again.

On startup it reads your Claude Code OAuth tokens from the macOS Keychain (or
`~/.claude/.credentials.json` on other platforms), caches them in memory with a
30-second TTL, and seeds them into pi's `~/.pi/agent/auth.json` under the
`anthropic` provider. pi then uses those credentials with **zero separate
login**. On macOS, multiple Claude Code accounts are detected automatically and
can be switched via `/login`.

It overrides the `anthropic` provider's OAuth lifecycle: when a token is near
expiry, pi delegates refresh to this extension, which refreshes directly via
Anthropic's OAuth endpoint (zero LLM tokens consumed), falls back to the Claude
CLI if that fails, and writes rotated tokens **back** to the Keychain or
credentials file so Claude Code and pi stay in sync. A background re-sync runs
every 5 minutes. pi's built-in Anthropic provider handles the Claude Code
request fidelity (identity, beta flags, tool naming) for OAuth tokens.

## Prerequisites

- Claude Code installed and authenticated (run `claude` at least once)
- pi installed (`npm install -g --ignore-scripts @earendil-works/pi-coding-agent`)

macOS is preferred (uses Keychain). Linux and Windows work via the credentials
file fallback.

## Installation

**Option A: Let an LLM do it**

Paste this into any LLM agent (pi, Claude Code, Cursor, etc.):

```
Install the pi-claude-auth package and configure it by following: https://raw.githubusercontent.com/pankajudhas81/pi-claude-auth/main/installation.md
```

**Option B: Install as a pi package**

```bash
pi install npm:pi-claude-auth
```

This installs the extension globally to `~/.pi/agent/npm/`. Use `-l` for a
project-local install.

**Option C: settings.json**

Add it to `~/.pi/agent/settings.json` (global) or `.pi/settings.json`
(project):

```json
{
    "packages": ["npm:pi-claude-auth@latest"]
}
```

Then just run `pi`. The extension handles auth automatically using your Claude
Code credentials.

## Usage

Run `pi`, then pick a Claude model with `/model` (or Ctrl+L). The extension has
already seeded your Claude Code credentials, so there is nothing else to do — no
`/login`, no API key. Tokens refresh in the background and rotated tokens are
written back to Claude Code's storage.

If your Claude Code credentials aren't OAuth-based, the extension stays out of
the way and pi falls through to its standard Anthropic auth.

## Supported models

15 supported models. Run `pnpm run test:models` to verify against your account.

| Model                      |
| -------------------------- |
| claude-haiku-4-5           |
| claude-haiku-4-5-20251001  |
| claude-opus-4-0            |
| claude-opus-4-1            |
| claude-opus-4-1-20250805   |
| claude-opus-4-20250514     |
| claude-opus-4-5            |
| claude-opus-4-5-20251101   |
| claude-opus-4-6            |
| claude-opus-4-7            |
| claude-sonnet-4-0          |
| claude-sonnet-4-20250514   |
| claude-sonnet-4-5          |
| claude-sonnet-4-5-20250929 |
| claude-sonnet-4-6          |

## Credential sources

The extension checks these in order:

1. macOS Keychain (all `Claude Code-credentials*` entries — multiple accounts
   are detected automatically)
2. `~/.claude/.credentials.json` (fallback, works on all platforms)

## Multiple accounts (macOS)

If you have multiple Claude Code accounts authenticated on macOS, the extension
detects all of them from the Keychain automatically. Each account is labeled by
its subscription tier (Claude Pro, Claude Max, etc.).

To switch accounts:

```
/login
```

Select the `anthropic` provider, then pick the account you want. Your selection
is persisted across sessions in `~/.pi/agent/claude-account-source.txt`. If only
one account is found, the picker is skipped.

## Troubleshooting

| Problem                            | Solution                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| "No Claude Code credentials found" | Run `claude` to authenticate with Claude Code first                                                              |
| "Keychain is locked"               | Run `security unlock-keychain ~/Library/Keychains/login.keychain-db`                                             |
| "Token expired and refresh failed" | The extension runs the `claude` CLI to refresh automatically. If this fails, re-authenticate by running `claude` |
| Not working on Linux/Windows       | Ensure `~/.claude/.credentials.json` exists. Run `claude` to create it                                           |
| Keychain access denied             | Grant access when macOS prompts you                                                                              |
| Keychain read timed out            | Restart Keychain Access (can happen on macOS Tahoe)                                                              |
| Package not updating               | Run `pi update npm:pi-claude-auth`                                                                               |

### Diagnostic logging

If you hit auth errors that are hard to reproduce, enable debug logging to
capture the full auth flow:

```bash
export PI_CLAUDE_AUTH_DEBUG=1
```

Restart pi and reproduce the issue. The extension writes structured JSON logs to
`~/.pi/agent/pi-claude-auth-debug.log`. All secrets (tokens, API keys) are
automatically redacted — the log file is safe to share when reporting an issue.

To write logs to a custom path:

```bash
export PI_CLAUDE_AUTH_DEBUG=/tmp/pi-claude-auth-debug.log
```

Disable when done:

```bash
unset PI_CLAUDE_AUTH_DEBUG
```

## Validating OAuth refresh

To verify the direct OAuth token refresh works with your credentials:

```bash
pnpm run validate:oauth                # refresh + write-back (safe)
pnpm run validate:oauth -- --dry-run   # show what would be sent, no request
```

This reads your stored credentials, calls Anthropic's OAuth token endpoint, and
writes the new tokens back to storage. Refresh tokens rotate on each use, so
write-back is enabled by default to keep your stored credentials valid.

## Environment variables

| Variable                | Description                                                             | Default       |
| ----------------------- | ----------------------------------------------------------------------- | ------------- |
| `PI_CODING_AGENT_DIR`   | pi's config directory (where `auth.json` lives)                         | `~/.pi/agent` |
| `PI_CLAUDE_AUTH_DEBUG`  | Enable diagnostic logging (`1` for default path, or a custom file path) | disabled      |
| `ANTHROPIC_CLI_VERSION` | Claude CLI version used by the model smoke-test headers                 | `2.1.112`     |

## How it works (technical)

- Reads all `Claude Code-credentials*` Keychain entries on macOS (labeled by
  subscription tier), falling back to `~/.claude/.credentials.json`
- Seeds the active account's tokens into `~/.pi/agent/auth.json` as an
  `{ type: "oauth", access, refresh, expires }` entry under `anthropic`, so pi
  uses them with no separate `/login`
- Registers an `anthropic` OAuth provider override via
  `pi.registerProvider("anthropic", { oauth })`:
    - `login` reads the Keychain/file (no browser) and exposes an account picker
      when multiple accounts exist
    - `refreshToken` refreshes directly via `POST https://claude.ai/v1/oauth/token`
      (no LLM tokens), falls back to the `claude` CLI, and writes rotated tokens
      back to the Keychain (macOS) or credentials file (other platforms)
    - `getApiKey` returns the freshest cached access token
- Re-syncs `auth.json` every 5 minutes (sync never triggers a refresh; refresh
  is lazy, only when pi requests it or a request needs a fresh token)
- pi's built-in Anthropic provider applies the Claude Code identity, beta flags,
  and tool-name conventions for OAuth tokens, so requests look like Claude Code
- If credentials aren't OAuth-based or can't be read, the extension disables
  itself and pi continues with its standard Anthropic auth

## Acknowledgements

This project is motivated by and shamelessly copies patterns from
[opencode-claude-auth](https://github.com/griffinmartin/opencode-claude-auth)
by Griffin Martin. That project solved the same problem for
[opencode](https://github.com/nichochar/opencode) — reusing Claude Code OAuth
credentials so you don't need a separate login. We adopted the same approach
(Keychain reading, token refresh, credential seeding) and adapted it for pi's
extension API.

## Disclaimer

This extension uses Claude Code's OAuth credentials to authenticate with
Anthropic's API. Anthropic's Terms of Service state that Claude Pro/Max
subscription tokens should only be used with official Anthropic clients. This
extension exists as a community workaround and may stop working if Anthropic
changes their OAuth infrastructure. Use at your own discretion.

## License

MIT
