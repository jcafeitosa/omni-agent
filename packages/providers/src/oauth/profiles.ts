import { OAuthProviderProfile } from "@omni-agent/core";

export const codexOAuthProfile: OAuthProviderProfile = {
    id: "codex",
    displayName: "OpenAI Codex CLI",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    scopes: ["openid", "profile", "email", "offline_access"],
    redirectUri: "http://localhost:1455/auth/callback",
    authFlow: "pkce",
    identity: {
        cliName: "codex",
        userAgent: "CodexCLI/1.0",
        headers: {
            "X-Omni-Agent-Auth-Profile": "codex"
        },
        query: {
            codex_cli_simplified_flow: "true"
        },
        body: {
            originator: "omni-agent"
        }
    }
};

export const claudeCodeOAuthProfile: OAuthProviderProfile = {
    id: "claude-code",
    displayName: "Claude Code CLI",
    authorizeUrl: "https://claude.ai/oauth/authorize",
    tokenUrl: "https://console.anthropic.com/v1/oauth/token",
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    scopes: ["org:create_api_key", "user:profile", "user:inference"],
    redirectUri: "https://console.anthropic.com/oauth/code/callback",
    authFlow: "pkce",
    identity: {
        cliName: "claude-code",
        userAgent: "ClaudeCode/1.0",
        headers: {
            "X-Omni-Agent-Auth-Profile": "claude-code"
        }
    }
};

export const cursorOAuthProfile: OAuthProviderProfile = {
    id: "cursor",
    displayName: "Cursor",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    clientId: "cursor-cli",
    scopes: ["openid", "profile", "email", "offline_access"],
    redirectUri: "http://localhost:3005/auth/callback",
    authFlow: "pkce",
    identity: {
        cliName: "cursor",
        userAgent: "Cursor/1.0",
        headers: {
            "X-Omni-Agent-Auth-Profile": "cursor"
        }
    }
};

export const geminiCliOAuthProfile: OAuthProviderProfile = {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
    scopes: [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
    ],
    redirectUri: "http://localhost:8085/oauth2callback",
    authFlow: "pkce",
    identity: {
        cliName: "gemini-cli",
        userAgent: "google-api-nodejs-client/9.15.1",
        headers: {
            "X-Goog-Api-Client": "gl-node/22.17.0",
            "X-Omni-Agent-Auth-Profile": "gemini-cli"
        }
    }
};

export const defaultOAuthProfiles: OAuthProviderProfile[] = [
    codexOAuthProfile,
    claudeCodeOAuthProfile,
    cursorOAuthProfile,
    geminiCliOAuthProfile
];

export function getOAuthProfileById(id: string): OAuthProviderProfile | undefined {
    return defaultOAuthProfiles.find((profile) => profile.id === id);
}
