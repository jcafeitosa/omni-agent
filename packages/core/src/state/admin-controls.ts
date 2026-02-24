export interface AdminMcpAllowlistServer {
    url?: string;
    type?: "sse" | "http" | "stdio";
    trust?: boolean;
    includeTools?: string[];
    excludeTools?: string[];
}

export interface AdminControlsSettings {
    strictModeEnabled?: boolean;
    extensionsEnabled?: boolean;
    mcpEnabled?: boolean;
    unmanagedCapabilitiesEnabled?: boolean;
    mcpAllowlist?: Record<string, AdminMcpAllowlistServer>;
}

export function isFeatureEnabled(value: boolean | undefined, defaultValue: boolean): boolean {
    if (value === undefined) return defaultValue;
    return value;
}
