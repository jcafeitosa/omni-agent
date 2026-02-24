import { createHash, randomBytes } from "node:crypto";
import { URLSearchParams } from "node:url";
import { OAuthProviderProfile } from "./types.js";

export interface PkceStartResult {
    authorizationUrl: string;
    state: string;
    codeVerifier: string;
    codeChallenge: string;
}

export interface DeviceAuthorizationResult {
    deviceCode: string;
    userCode?: string;
    verificationUri?: string;
    verificationUriComplete?: string;
    interval?: number;
    expiresIn?: number;
}

export interface TokenExchangeResult {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    tokenType?: string;
    scope?: string;
    idToken?: string;
    raw: Record<string, unknown>;
}

export function generateCodeVerifier(length = 64): string {
    return base64Url(randomBytes(length));
}

export function generateState(length = 24): string {
    return base64Url(randomBytes(length));
}

export function toCodeChallengeS256(codeVerifier: string): string {
    const digest = createHash("sha256").update(codeVerifier).digest();
    return base64Url(digest);
}

export function buildAuthorizationUrl(profile: OAuthProviderProfile, params: Record<string, string>): string {
    const url = new URL(profile.authorizeUrl);
    const search = new URLSearchParams({
        response_type: "code",
        client_id: profile.clientId,
        redirect_uri: profile.redirectUri,
        scope: profile.scopes.join(" "),
        ...profile.identity.query,
        ...params
    });
    url.search = search.toString();
    return url.toString();
}

export function startPkce(profile: OAuthProviderProfile): PkceStartResult {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = toCodeChallengeS256(codeVerifier);
    const authorizationUrl = buildAuthorizationUrl(profile, {
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256"
    });
    return { authorizationUrl, state, codeVerifier, codeChallenge };
}

export async function exchangeAuthorizationCode(
    profile: OAuthProviderProfile,
    code: string,
    codeVerifier?: string
): Promise<TokenExchangeResult> {
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: profile.clientId,
        redirect_uri: profile.redirectUri,
        code,
        ...profile.identity.body
    });
    if (profile.clientSecret) {
        body.set("client_secret", profile.clientSecret);
    }
    if (codeVerifier) {
        body.set("code_verifier", codeVerifier);
    }

    const json = await postToken(profile.tokenUrl, body, profile.identity.headers);
    return normalizeTokenResponse(json);
}

export async function refreshAccessToken(
    profile: OAuthProviderProfile,
    refreshToken: string
): Promise<TokenExchangeResult> {
    const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: profile.clientId,
        refresh_token: refreshToken,
        ...profile.identity.body
    });
    if (profile.clientSecret) {
        body.set("client_secret", profile.clientSecret);
    }

    const json = await postToken(profile.tokenUrl, body, profile.identity.headers);
    return normalizeTokenResponse(json);
}

export async function startDeviceAuthorization(profile: OAuthProviderProfile): Promise<DeviceAuthorizationResult> {
    if (!profile.deviceAuthorizeUrl) {
        throw new Error(`Provider ${profile.id} does not define deviceAuthorizeUrl.`);
    }
    const body = new URLSearchParams({
        client_id: profile.clientId,
        scope: profile.scopes.join(" "),
        ...profile.identity.body
    });
    const json = await postToken(profile.deviceAuthorizeUrl, body, profile.identity.headers);

    return {
        deviceCode: String(json.device_code || ""),
        userCode: asString(json.user_code),
        verificationUri: asString(json.verification_uri),
        verificationUriComplete: asString(json.verification_uri_complete),
        interval: asNumber(json.interval),
        expiresIn: asNumber(json.expires_in)
    };
}

export async function pollDeviceToken(
    profile: OAuthProviderProfile,
    deviceCode: string,
    options: { intervalSeconds?: number; timeoutMs?: number } = {}
): Promise<TokenExchangeResult> {
    const intervalSeconds = options.intervalSeconds ?? 5;
    const timeoutMs = options.timeoutMs ?? 5 * 60_000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        const body = new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            client_id: profile.clientId,
            device_code: deviceCode,
            ...profile.identity.body
        });
        if (profile.clientSecret) {
            body.set("client_secret", profile.clientSecret);
        }

        const response = await fetch(profile.tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                ...(profile.identity.headers || {})
            },
            body: body.toString()
        });
        const json = (await response.json()) as Record<string, unknown>;
        if (response.ok && json.access_token) {
            return normalizeTokenResponse(json);
        }

        const err = asString(json.error);
        if (err === "authorization_pending") {
            await delay(intervalSeconds * 1000);
            continue;
        }
        if (err === "slow_down") {
            await delay((intervalSeconds + 5) * 1000);
            continue;
        }
        throw new Error(asString(json.error_description) || err || `Device auth failed for ${profile.id}`);
    }

    throw new Error(`Device auth timeout for provider ${profile.id}`);
}

async function postToken(
    url: string,
    body: URLSearchParams,
    extraHeaders?: Record<string, string>
): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            ...(extraHeaders || {})
        },
        body: body.toString()
    });

    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
        throw new Error(asString(json.error_description) || asString(json.error) || `OAuth token endpoint failed: ${url}`);
    }
    return json;
}

function normalizeTokenResponse(json: Record<string, unknown>): TokenExchangeResult {
    const accessToken = asString(json.access_token);
    if (!accessToken) {
        throw new Error("OAuth token response missing access_token");
    }
    return {
        accessToken,
        refreshToken: asString(json.refresh_token) || undefined,
        expiresIn: asNumber(json.expires_in),
        tokenType: asString(json.token_type) || "Bearer",
        scope: asString(json.scope) || undefined,
        idToken: asString(json.id_token) || undefined,
        raw: json
    };
}

function base64Url(buf: Buffer): string {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | undefined {
    return typeof value === "number" ? value : undefined;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

