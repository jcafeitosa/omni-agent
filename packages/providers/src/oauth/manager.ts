import { OAuthManager } from "@omni-agent/core";
import { defaultOAuthProfiles } from "./profiles.js";

export interface DefaultOAuthManagerOptions {
    manager?: OAuthManager;
}

export function createDefaultOAuthManager(options: DefaultOAuthManagerOptions = {}): OAuthManager {
    const manager = options.manager || new OAuthManager();
    manager.registerProfiles(defaultOAuthProfiles);
    return manager;
}

