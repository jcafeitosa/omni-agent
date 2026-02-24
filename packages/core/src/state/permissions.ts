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
}

/**
 * Callback for manual permission checks (e.g., UI prompt).
 */
export type CanUseToolCallback = (toolName: string, input: any) => Promise<PermissionResult>;

/**
 * Manages tool execution permissions, aligned with Claude Agent SDK.
 */
export class PermissionManager {
    private mode: PermissionMode;
    private canUseTool?: CanUseToolCallback;

    constructor(mode: PermissionMode = 'default', canUseTool?: CanUseToolCallback) {
        this.mode = mode;
        this.canUseTool = canUseTool;
    }

    getMode(): PermissionMode {
        return this.mode;
    }

    setMode(mode: PermissionMode) {
        this.mode = mode;
    }

    /**
     * Checks if a tool can be executed based on the current mode and callback.
     */
    async checkPermission(toolName: string, input: any): Promise<PermissionResult> {
        // Bypass always allows
        if (this.mode === 'bypassPermissions') {
            return { behavior: 'allow' };
        }

        // Plan mode always denies execution
        if (this.mode === 'plan') {
            return { behavior: 'deny', reason: 'Tool execution is disabled in "plan" mode.' };
        }

        // acceptEdits auto-allows file modifications
        if (this.mode === 'acceptEdits' && (toolName === 'edit' || toolName === 'write_file' || toolName === 'writeFile')) {
            return { behavior: 'allow' };
        }

        // dontAsk denies if not explicitly allowed (placeholder for more complex rules)
        if (this.mode === 'dontAsk') {
            return { behavior: 'deny', reason: 'Tool execution denied in "dontAsk" mode.' };
        }

        // Delegate to callback if provided (e.g., for CLI interactive prompts)
        if (this.canUseTool) {
            return await this.canUseTool(toolName, input);
        }

        // Default behavior (placeholder: allow all for now)
        return { behavior: 'allow' };
    }
}
