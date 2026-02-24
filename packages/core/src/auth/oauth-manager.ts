import {
    OAuthCredentialStore,
    OAuthCredentials,
    OAuthProviderProfile,
    OAuthRefreshFn
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
        await this.store.save(providerId, credentials);
    }

    public async deleteCredentials(providerId: string): Promise<boolean> {
        return this.store.delete(providerId);
    }

    public async getAccessToken(providerId: string): Promise<string | null> {
        const profile = this.profiles.get(providerId);
        if (!profile) {
            throw new Error(`Unknown OAuth provider profile: ${providerId}`);
        }

        const credentials = await this.store.load(providerId);
        if (!credentials) return null;

        if (this.isExpired(credentials)) {
            const refreshed = await this.refresh(providerId, credentials, profile);
            await this.store.save(providerId, refreshed);
            return refreshed.accessToken;
        }

        return credentials.accessToken;
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
        await this.store.save(providerId, credentials);
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
        await this.store.save(providerId, credentials);
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
        await this.store.save(providerId, refreshed);
        return refreshed;
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
            metadata: {
                ...(previous?.metadata || {}),
                ...(token.raw || {})
            }
        };
    }
}
