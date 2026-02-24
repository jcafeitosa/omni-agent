import { PolicyEngine, ToolPolicyContext } from "./policy-engine.js";

/**
 * Permission Mode for the agent session.
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

/**
 * Result of a permission check.
 */
export interface PermissionResult {
    behavior: 'allow' | 'deny';
    reason?: string;
    suggestions?: PermissionSuggestion[];
}

export interface PermissionSuggestion {
    id: string;
    label: string;
    mode: PermissionMode;
    scope?: "once" | "session" | "project";
}

/**
 * Callback for manual permission checks (e.g., UI prompt).
 */
export type CanUseToolCallback = (toolName: string, input: any) => Promise<PermissionResult>;

/**
 * Manages tool execution permissions in a provider-agnostic way.
 */
export class PermissionManager {
    private mode: PermissionMode;
    private canUseTool?: CanUseToolCallback;
    private policyEngine?: PolicyEngine;

    constructor(mode: PermissionMode = 'default', canUseTool?: CanUseToolCallback, policyEngine?: PolicyEngine) {
        this.mode = mode;
        this.canUseTool = canUseTool;
        this.policyEngine = policyEngine;
    }

    getMode(): PermissionMode {
        return this.mode;
    }

    setMode(mode: PermissionMode) {
        this.mode = mode;
    }

    setPolicyEngine(policyEngine?: PolicyEngine) {
        this.policyEngine = policyEngine;
    }

    /**
     * Checks if a tool can be executed based on the current mode and callback.
     */
    async checkPermission(toolName: string, input: any, context?: Omit<ToolPolicyContext, "toolName" | "input">): Promise<PermissionResult> {
        if (this.policyEngine) {
            const decision = this.policyEngine.evaluateTool({
                toolName,
                input,
                permissionMode: this.mode,
                ...context
            });
            if (decision) return decision;
        }

        // Bypass always allows
        if (this.mode === 'bypassPermissions') {
            return { behavior: 'allow' };
        }

        // Plan mode always denies execution
        if (this.mode === 'plan') {
            return {
                behavior: 'deny',
                reason: 'Tool execution is disabled in "plan" mode.',
                suggestions: [
                    { id: "switch-default", label: "Switch to default mode", mode: "default", scope: "session" },
                    { id: "switch-bypass", label: "Switch to bypass mode", mode: "bypassPermissions", scope: "session" }
                ]
            };
        }

        // acceptEdits auto-allows file modifications
        if (this.mode === 'acceptEdits' && (toolName === 'edit' || toolName === 'write_file' || toolName === 'writeFile')) {
            return { behavior: 'allow' };
        }

        // dontAsk denies if not explicitly allowed (placeholder for more complex rules)
        if (this.mode === 'dontAsk') {
            return {
                behavior: 'deny',
                reason: 'Tool execution denied in "dontAsk" mode.',
                suggestions: [
                    { id: "switch-default", label: "Switch to default mode", mode: "default", scope: "session" },
                    { id: "switch-plan", label: "Switch to plan mode", mode: "plan", scope: "session" }
                ]
            };
        }

        // Delegate to callback if provided (e.g., for CLI interactive prompts)
        if (this.canUseTool) {
            return await this.canUseTool(toolName, input);
        }

        // Default behavior (placeholder: allow all for now)
        return { behavior: 'allow' };
    }
}
