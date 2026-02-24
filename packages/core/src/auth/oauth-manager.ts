import {
    OAuthCredentialStore,
    OAuthCredentials,
    OAuthProviderProfile,
    OAuthRefreshFn,
    OAuthAccountSelectionStrategy,
    OAuthAccountTokenLease,
    OAuthTokenAcquireOptions,
    OAuthRateLimitInfo
} from "./types.js";
import { createOAuthCredentialStore } from "./credential-store.js";
import {
    DeviceAuthorizationResult,
    exchangeAuthorizationCode,
    pollDeviceToken,
    refreshAccessToken,
    startDeviceAuthorization,
    startPkce
} from "./oauth-client.js";

interface OAuthManagerOptions {
    store?: OAuthCredentialStore;
    refreshFn?: OAuthRefreshFn;
}

export class OAuthManager {
    private readonly store: OAuthCredentialStore;
    private readonly refreshFn?: OAuthRefreshFn;
    private readonly profiles = new Map<string, OAuthProviderProfile>();
    private readonly accountOrder = new Map<string, string[]>();
    private readonly roundRobinState = new Map<string, number>();
    private readonly inFlightCounts = new Map<string, Map<string, number>>();
    private readonly strategyByProvider = new Map<string, OAuthAccountSelectionStrategy>();

    constructor(options: OAuthManagerOptions = {}) {
        this.store = options.store || createOAuthCredentialStore();
        this.refreshFn = options.refreshFn;
    }

    public registerProfile(profile: OAuthProviderProfile): void {
        this.profiles.set(profile.id, profile);
    }

    public registerProfiles(profiles: OAuthProviderProfile[]): void {
        for (const profile of profiles) {
            this.registerProfile(profile);
        }
    }

    public getProfile(providerId: string): OAuthProviderProfile | undefined {
        return this.profiles.get(providerId);
    }

    public listProfiles(): OAuthProviderProfile[] {
        return Array.from(this.profiles.values());
    }

    public async loadCredentials(providerId: string): Promise<OAuthCredentials | null> {
        return this.store.load(providerId);
    }

    public async saveCredentials(providerId: string, credentials: OAuthCredentials): Promise<void> {
        const accountId = credentials.accountId || "default";
        await this.saveAccountCredentials(providerId, accountId, credentials);
    }

    public async deleteCredentials(providerId: string): Promise<boolean> {
        const accountIds = await this.listAccountIds(providerId);
        if (accountIds.length === 0) {
            return this.store.delete(providerId);
        }
        let removed = false;
        for (const accountId of accountIds) {
            removed = (await this.deleteAccountCredentials(providerId, accountId)) || removed;
        }
        return removed;
    }

    public async getAccessToken(providerId: string): Promise<string | null> {
        const lease = await this.acquireAccessToken(providerId);
        if (!lease) return null;
        lease.release();
        return lease.accessToken;
    }

    public setProviderStrategy(providerId: string, strategy: OAuthAccountSelectionStrategy): void {
        this.strategyByProvider.set(providerId, strategy);
    }

    public getProviderStrategy(providerId: string): OAuthAccountSelectionStrategy | undefined {
        return this.strategyByProvider.get(providerId);
    }

    public async listAccountIds(providerId: string): Promise<string[]> {
        const cached = this.accountOrder.get(providerId);
        if (cached && cached.length > 0) return [...cached];

        const keys = await this.store.listProviderIds();
        const fromStore = keys
            .map((key) => parseAccountStorageKey(key))
            .filter((entry): entry is { providerId: string; accountId: string } => Boolean(entry))
            .filter((entry) => entry.providerId === providerId)
            .map((entry) => entry.accountId);

        if (fromStore.length > 0) {
            const deduped = dedupe(fromStore);
            this.accountOrder.set(providerId, deduped);
            return deduped;
        }

        const fallback = await this.store.load(providerId);
        if (fallback) {
            this.accountOrder.set(providerId, ["default"]);
            return ["default"];
        }

        return [];
    }

    public async loadAccountCredentials(providerId: string, accountId: string): Promise<OAuthCredentials | null> {
        const key = toAccountStorageKey(providerId, accountId);
        const exact = await this.store.load(key);
        if (exact) return exact;
        if (accountId === "default") {
            return this.store.load(providerId);
        }
        return null;
    }

    public async saveAccountCredentials(providerId: string, accountId: string, credentials: OAuthCredentials): Promise<void> {
        const key = toAccountStorageKey(providerId, accountId);
        const next: OAuthCredentials = {
            ...credentials,
            accountId,
            updatedAt: Date.now()
        };
        await this.store.save(key, next);
        this.trackAccount(providerId, accountId);
        if (accountId === "default") {
            await this.store.save(providerId, next);
        }
    }

    public async deleteAccountCredentials(providerId: string, accountId: string): Promise<boolean> {
        const key = toAccountStorageKey(providerId, accountId);
        let removed = await this.store.delete(key);
        if (accountId === "default") {
            removed = (await this.store.delete(providerId)) || removed;
        }
        const current = this.accountOrder.get(providerId) || [];
        const next = current.filter((id) => id !== accountId);
        this.accountOrder.set(providerId, next);
        return removed;
    }

    public async acquireAccessToken(
        providerId: string,
        options: OAuthTokenAcquireOptions = {}
    ): Promise<OAuthAccountTokenLease | null> {
        const profile = this.profiles.get(providerId);
        if (!profile) {
            throw new Error(`Unknown OAuth provider profile: ${providerId}`);
        }

        const strategy = options.strategy || this.strategyByProvider.get(providerId) || "round_robin";
        const accountIds = await this.listAccountIds(providerId);
        const selectedAccountId = options.accountId || (await this.selectAccountId(providerId, accountIds, strategy));
        if (!selectedAccountId) return null;

        let credentials = await this.loadAccountCredentials(providerId, selectedAccountId);
        if (!credentials && selectedAccountId === "default") {
            credentials = await this.store.load(providerId);
        }
        if (!credentials) return null;

        if (this.isExpired(credentials)) {
            const refreshed = await this.refresh(providerId, credentials, profile);
            await this.saveAccountCredentials(providerId, selectedAccountId, refreshed);
            credentials = refreshed;
        }

        const inFlight = this.inFlightCounts.get(providerId) || new Map<string, number>();
        this.inFlightCounts.set(providerId, inFlight);
        inFlight.set(selectedAccountId, (inFlight.get(selectedAccountId) || 0) + 1);

        const now = Date.now();
        credentials.lastUsedAt = now;
        await this.saveAccountCredentials(providerId, selectedAccountId, credentials);

        return {
            providerId,
            accountId: selectedAccountId,
            accessToken: credentials.accessToken,
            release: () => {
                const count = inFlight.get(selectedAccountId) || 0;
                if (count <= 1) inFlight.delete(selectedAccountId);
                else inFlight.set(selectedAccountId, count - 1);
            }
        };
    }

    public async reportRateLimit(providerId: string, accountId: string, info: OAuthRateLimitInfo): Promise<void> {
        const credentials = await this.loadAccountCredentials(providerId, accountId);
        if (!credentials) return;

        const resetAt = resolveResetAt(info);
        const current = toRateLimitMetadata(credentials.metadata);
        const next = {
            remaining: info.remaining ?? current.remaining,
            limit: info.limit ?? current.limit,
            resetAt: resetAt ?? current.resetAt,
            updatedAt: Date.now()
        };

        await this.saveAccountCredentials(providerId, accountId, {
            ...credentials,
            metadata: {
                ...(credentials.metadata || {}),
                oauthRateLimit: next
            }
        });
    }

    public buildAuthHeaders(providerId: string, accessToken: string): Record<string, string> {
        const profile = this.profiles.get(providerId);
        if (!profile) {
            throw new Error(`Unknown OAuth provider profile: ${providerId}`);
        }

        const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`,
            ...profile.identity.headers
        };

        if (profile.identity.userAgent) {
            headers["User-Agent"] = profile.identity.userAgent;
        }

        return headers;
    }

    public startPkceLogin(providerId: string): { authorizationUrl: string; state: string; codeVerifier: string } {
        const profile = this.profiles.get(providerId);
        if (!profile) {
            throw new Error(`Unknown OAuth provider profile: ${providerId}`);
        }
        const result = startPkce(profile);
        return {
            authorizationUrl: result.authorizationUrl,
            state: result.state,
            codeVerifier: result.codeVerifier
        };
    }

    public async completeAuthorizationCodeLogin(
        providerId: string,
        input: { code: string; codeVerifier?: string; expectedState?: string; state?: string }
    ): Promise<OAuthCredentials> {
        const profile = this.profiles.get(providerId);
        if (!profile) {
            throw new Error(`Unknown OAuth provider profile: ${providerId}`);
        }
        if (input.expectedState && input.state && input.expectedState !== input.state) {
            throw new Error(`OAuth state mismatch for provider ${providerId}`);
        }
        const token = await exchangeAuthorizationCode(profile, input.code, input.codeVerifier);
        const credentials = this.fromTokenResponse(token, profile);
        await this.saveAccountCredentials(providerId, "default", credentials);
        return credentials;
    }

    public async startDeviceLogin(providerId: string): Promise<DeviceAuthorizationResult> {
        const profile = this.profiles.get(providerId);
        if (!profile) {
            throw new Error(`Unknown OAuth provider profile: ${providerId}`);
        }
        return startDeviceAuthorization(profile);
    }

    public async pollAndCompleteDeviceLogin(
        providerId: string,
        deviceCode: string,
        options: { intervalSeconds?: number; timeoutMs?: number } = {}
    ): Promise<OAuthCredentials> {
        const profile = this.profiles.get(providerId);
        if (!profile) {
            throw new Error(`Unknown OAuth provider profile: ${providerId}`);
        }
        const token = await pollDeviceToken(profile, deviceCode, options);
        const credentials = this.fromTokenResponse(token, profile);
        await this.saveAccountCredentials(providerId, "default", credentials);
        return credentials;
    }

    public async refreshIfNeeded(providerId: string): Promise<OAuthCredentials | null> {
        const profile = this.profiles.get(providerId);
        if (!profile) {
            throw new Error(`Unknown OAuth provider profile: ${providerId}`);
        }
        const credentials = await this.store.load(providerId);
        if (!credentials) return null;
        if (!this.isExpired(credentials)) return credentials;

        const refreshed = await this.refresh(providerId, credentials, profile);
        await this.saveAccountCredentials(providerId, credentials.accountId || "default", refreshed);
        return refreshed;
    }

    private async selectAccountId(
        providerId: string,
        accountIds: string[],
        strategy: OAuthAccountSelectionStrategy
    ): Promise<string | null> {
        if (accountIds.length === 0) return null;
        if (accountIds.length === 1) return accountIds[0];

        const accountStates = await Promise.all(
            accountIds.map(async (accountId) => {
                const credentials = await this.loadAccountCredentials(providerId, accountId);
                const rate = toRateLimitMetadata(credentials?.metadata);
                const now = Date.now();
                const isLimited = Boolean(rate.resetAt && rate.resetAt > now) || (rate.remaining !== undefined && rate.remaining <= 0);
                const resetAt = rate.resetAt || 0;
                const ts = credentials?.lastUsedAt || credentials?.updatedAt || 0;
                const inFlight = this.inFlightCounts.get(providerId)?.get(accountId) || 0;
                return { accountId, ts, inFlight, isLimited, resetAt };
            })
        );

        const available = accountStates.filter((s) => !s.isLimited);
        const pool = available.length > 0 ? available : accountStates;
        if (pool.length === 0) return null;

        if (available.length === 0) {
            // all accounts are rate limited; pick the one with closest reset to recover fastest
            return [...pool].sort((a, b) => a.resetAt - b.resetAt)[0].accountId;
        }

        if (strategy === "single") {
            return pool[0].accountId;
        }

        if (strategy === "round_robin") {
            const idx = this.roundRobinState.get(providerId) || 0;
            const next = pool[idx % pool.length].accountId;
            this.roundRobinState.set(providerId, (idx + 1) % pool.length);
            return next;
        }

        if (strategy === "least_recent") {
            return [...pool].sort((a, b) => a.ts - b.ts)[0].accountId;
        }

        if (strategy === "parallel") {
            return [...pool]
                .sort((a, b) => a.inFlight - b.inFlight || a.ts - b.ts)[0]
                .accountId;
        }

        if (strategy === "random") {
            return pool[Math.floor(Math.random() * pool.length)].accountId;
        }

        return pool[0].accountId;
    }

    private trackAccount(providerId: string, accountId: string): void {
        const list = this.accountOrder.get(providerId) || [];
        if (!list.includes(accountId)) {
            list.push(accountId);
            this.accountOrder.set(providerId, list);
        }
    }

    private isExpired(credentials: OAuthCredentials): boolean {
        if (!credentials.expiresAt) return false;
        return Date.now() >= credentials.expiresAt;
    }

    private async refresh(
        providerId: string,
        credentials: OAuthCredentials,
        profile: OAuthProviderProfile
    ): Promise<OAuthCredentials> {
        if (this.refreshFn) {
            return this.refreshFn(credentials, { providerId, profile });
        }
        if (!credentials.refreshToken) {
            throw new Error(`OAuth token expired and refresh token is not available for ${providerId}`);
        }
        const token = await refreshAccessToken(profile, credentials.refreshToken);
        return this.fromTokenResponse(token, profile, credentials);
    }

    private fromTokenResponse(
        token: {
            accessToken: string;
            refreshToken?: string;
            expiresIn?: number;
            tokenType?: string;
            scope?: string;
            raw?: Record<string, unknown>;
        },
        profile: OAuthProviderProfile,
        previous?: OAuthCredentials
    ): OAuthCredentials {
        const expiresAt = token.expiresIn ? Date.now() + token.expiresIn * 1000 : previous?.expiresAt;
        return {
            accessToken: token.accessToken,
            refreshToken: token.refreshToken || previous?.refreshToken,
            expiresAt,
            tokenType: token.tokenType || previous?.tokenType || "Bearer",
            scopes: token.scope ? token.scope.split(/\s+/).filter(Boolean) : previous?.scopes || profile.scopes,
            accountId: previous?.accountId || "default",
            accountLabel: previous?.accountLabel,
            updatedAt: Date.now(),
            lastUsedAt: previous?.lastUsedAt,
            metadata: {
                ...(previous?.metadata || {}),
                ...(token.raw || {})
            }
        };
    }
}

function toRateLimitMetadata(metadata?: Record<string, unknown>): {
    remaining?: number;
    limit?: number;
    resetAt?: number;
} {
    const raw = (metadata?.oauthRateLimit || {}) as Record<string, unknown>;
    const remaining = typeof raw.remaining === "number" ? raw.remaining : undefined;
    const limit = typeof raw.limit === "number" ? raw.limit : undefined;
    const resetAt = typeof raw.resetAt === "number" ? raw.resetAt : undefined;
    return { remaining, limit, resetAt };
}

function resolveResetAt(info: OAuthRateLimitInfo): number | undefined {
    if (typeof info.resetAt === "number") return info.resetAt;
    if (typeof info.retryAfterMs === "number") return Date.now() + info.retryAfterMs;
    return undefined;
}

function toAccountStorageKey(providerId: string, accountId: string): string {
    return `${providerId}#${accountId}`;
}

function parseAccountStorageKey(key: string): { providerId: string; accountId: string } | null {
    const idx = key.indexOf("#");
    if (idx <= 0 || idx === key.length - 1) return null;
    return {
        providerId: key.slice(0, idx),
        accountId: key.slice(idx + 1)
    };
}

function dedupe(items: string[]): string[] {
    return Array.from(new Set(items.filter(Boolean)));
}
