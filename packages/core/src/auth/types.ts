export type OAuthCredentialsStoreMode = "auto" | "file" | "keyring";

export interface OAuthCredentials {
    accessToken: string;
    accountId?: string;
    accountLabel?: string;
    refreshToken?: string;
    expiresAt?: number;
    tokenType?: string;
    scopes?: string[];
    updatedAt?: number;
    lastUsedAt?: number;
    metadata?: Record<string, unknown>;
}

export interface OAuthClientIdentity {
    cliName: string;
    userAgent?: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: Record<string, string>;
}

export interface OAuthProviderProfile {
    id: string;
    displayName: string;
    authorizeUrl: string;
    tokenUrl: string;
    deviceAuthorizeUrl?: string;
    clientId: string;
    clientSecret?: string;
    scopes: string[];
    redirectUri: string;
    authFlow: "pkce" | "device_code" | "authorization_code";
    identity: OAuthClientIdentity;
}

export interface KeyringAdapter {
    load(service: string, account: string): Promise<string | null>;
    save(service: string, account: string, secret: string): Promise<void>;
    delete(service: string, account: string): Promise<boolean>;
}

export interface OAuthCredentialStore {
    load(providerId: string): Promise<OAuthCredentials | null>;
    save(providerId: string, credentials: OAuthCredentials): Promise<void>;
    delete(providerId: string): Promise<boolean>;
    listProviderIds(): Promise<string[]>;
}

export interface OAuthRefreshContext {
    providerId: string;
    profile: OAuthProviderProfile;
}

export type OAuthRefreshFn = (
    credentials: OAuthCredentials,
    context: OAuthRefreshContext
) => Promise<OAuthCredentials>;

export type OAuthAccountSelectionStrategy = "single" | "round_robin" | "least_recent" | "parallel" | "random";

export interface OAuthTokenAcquireOptions {
    accountId?: string;
    strategy?: OAuthAccountSelectionStrategy;
}

export interface OAuthAccountTokenLease {
    providerId: string;
    accountId: string;
    accessToken: string;
    release(): void;
}
