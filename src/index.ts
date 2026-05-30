import type {
    ExtensionAPI,
    ProviderConfig,
} from "@earendil-works/pi-coding-agent"
import {
    forceRefreshActiveCredentials,
    getCachedCredentials,
    getCredentialsForSync,
    initAccounts,
    loadPersistedAccountSource,
    refreshAccountsList,
    saveAccountSource,
    setActiveAccountSource,
    syncAuthJson,
    type ClaudeCredentials,
} from "./credentials.ts"
import { readAllClaudeAccounts, type ClaudeAccount } from "./keychain.ts"
import { initLogger, log } from "./logger.ts"

export {
    getCachedCredentials,
    syncAuthJson,
    refreshAccountsList,
    type ClaudeCredentials,
} from "./credentials.ts"
export { readAllClaudeAccounts, type ClaudeAccount } from "./keychain.ts"

// Derive the OAuth types from the official ProviderConfig so the extension
// stays fully typed without importing @earendil-works/pi-ai directly.
type OAuthConfig = NonNullable<ProviderConfig["oauth"]>
type OAuthCreds = Awaited<ReturnType<OAuthConfig["refreshToken"]>>
type LoginCallbacks = Parameters<OAuthConfig["login"]>[0]

const PROVIDER_ID = "anthropic"
const PROVIDER_LABEL = "Claude Code (subscription)"
const SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes

function toOAuthCreds(creds: ClaudeCredentials): OAuthCreds {
    return {
        access: creds.accessToken,
        refresh: creds.refreshToken,
        expires: creds.expiresAt,
    }
}

/**
 * pi-claude-auth extension.
 *
 * Reads your existing Claude Code OAuth credentials (macOS Keychain or
 * `~/.claude/.credentials.json`), seeds them into pi's auth.json so the
 * `anthropic` provider works with no separate login, keeps them synced, and
 * overrides the provider's OAuth lifecycle so token refresh writes rotated
 * tokens back to Claude Code's storage. pi's built-in Anthropic provider
 * handles the Claude Code request fidelity for OAuth tokens.
 */
const extension = async (pi: ExtensionAPI): Promise<void> => {
    initLogger()

    let accounts: ClaudeAccount[] = []
    try {
        accounts = readAllClaudeAccounts()
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        log("extension_init_error", { error })
        console.warn(
            "pi-claude-auth: Failed to read Claude Code credentials:",
            error,
        )
        return
    }

    initAccounts(accounts)

    if (accounts.length === 0) {
        log("extension_init_no_accounts", { reason: "no credentials found" })
        console.warn(
            "pi-claude-auth: No Claude Code credentials found. Run `claude` to authenticate first.",
        )
        return
    }

    const persistedSource = loadPersistedAccountSource()
    const defaultAccount =
        (persistedSource &&
            accounts.find((a) => a.source === persistedSource)) ||
        accounts[0]

    setActiveAccountSource(defaultAccount.source)

    log("extension_init", {
        accountCount: accounts.length,
        sources: accounts.map((a) => a.source),
        activeSource: defaultAccount.source,
    })

    // Seed auth.json so pi uses the Claude Code credentials with zero login.
    const initialCreds = getCachedCredentials()
    if (initialCreds) {
        syncAuthJson(initialCreds)
    } else {
        console.warn(
            "pi-claude-auth: Claude credentials are expired and could not be refreshed. Run `claude` to re-authenticate.",
        )
    }

    // Keep auth.json synced with current credentials (no refresh triggered).
    const syncTimer = setInterval(() => {
        try {
            const creds = getCredentialsForSync()
            if (creds) syncAuthJson(creds)
        } catch {
            // Non-fatal
        }
    }, SYNC_INTERVAL)
    syncTimer.unref()

    const oauth: OAuthConfig = {
        name: PROVIDER_LABEL,

        async login(callbacks: LoginCallbacks): Promise<OAuthCreds> {
            const latestAccounts = refreshAccountsList()
            if (latestAccounts.length === 0) {
                throw new Error(
                    "No Claude Code credentials found. Run `claude` to authenticate first.",
                )
            }

            const currentSource =
                loadPersistedAccountSource() ?? defaultAccount.source
            let chosen =
                latestAccounts.find((a) => a.source === currentSource) ??
                latestAccounts[0]

            // Offer an account picker when multiple Claude Code accounts exist.
            if (latestAccounts.length > 1 && callbacks.onSelect) {
                const picked = await callbacks.onSelect({
                    message: "Select which Claude Code account to use:",
                    options: latestAccounts.map((a) => ({
                        id: a.source,
                        label:
                            a.source === currentSource
                                ? `${a.label} (active)`
                                : a.label,
                    })),
                })
                if (picked) {
                    chosen =
                        latestAccounts.find((a) => a.source === picked) ??
                        chosen
                }
            }

            setActiveAccountSource(chosen.source)
            saveAccountSource(chosen.source)

            const creds = getCachedCredentials() ?? chosen.credentials
            syncAuthJson(creds)
            log("login", { source: chosen.source, label: chosen.label })
            return toOAuthCreds(creds)
        },

        async refreshToken(credentials: OAuthCreds): Promise<OAuthCreds> {
            const fresh = forceRefreshActiveCredentials()
            if (fresh) {
                syncAuthJson(fresh)
                return toOAuthCreds(fresh)
            }
            log("refresh_token_fallback", {
                reason: "force refresh returned null",
            })
            // Return the supplied credentials unchanged so pi can surface a
            // clear auth error rather than crashing.
            return credentials
        },

        getApiKey(credentials: OAuthCreds): string {
            const latest = getCachedCredentials()
            return latest?.accessToken ?? credentials.access
        },
    }

    pi.registerProvider(PROVIDER_ID, { oauth })

    log("provider_registered", { provider: PROVIDER_ID })
}

export const ClaudeAuthExtension = extension
export default extension
