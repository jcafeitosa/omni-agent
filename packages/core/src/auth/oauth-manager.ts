import {
    OAuthCredentialStore,
    OAuthCredentials,
    OAuthProviderProfile,
    OAuthRefreshFn
} from "./types.js";
import { createOAuthCredentialStore } from "./credential-store.js";

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
            if (!this.refreshFn) return null;
            const refreshed = await this.refreshFn(credentials, { providerId, profile });
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

    private isExpired(credentials: OAuthCredentials): boolean {
        if (!credentials.expiresAt) return false;
        return Date.now() >= credentials.expiresAt;
    }
}
