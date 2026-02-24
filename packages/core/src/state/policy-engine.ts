import { PermissionMode, PermissionResult } from "./permissions.js";

export interface PolicyContext {
    agentName?: string;
    turnCount?: number;
    costUsd?: number;
    permissionMode?: PermissionMode;
}

export interface ToolPolicyContext extends PolicyContext {
    toolName: string;
    input?: unknown;
}

export interface PolicyRule {
    id: string;
    priority?: number;
    effect: "allow" | "deny";
    reason?: string;
    agents?: string[];
    tools?: string[];
    modes?: PermissionMode[];
    maxTurns?: number;
    maxCostUsd?: number;
}

export interface PolicyDecision extends PermissionResult {
    ruleId?: string;
}

export class PolicyEngine {
    private readonly rules: PolicyRule[];

    constructor(rules: PolicyRule[] = []) {
        this.rules = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }

    public addRule(rule: PolicyRule): void {
        this.rules.push(rule);
        this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }

    public listRules(): PolicyRule[] {
        return [...this.rules];
    }

    public evaluateTurn(context: PolicyContext): PolicyDecision | null {
        for (const rule of this.rules) {
            if (!matchesShared(rule, context)) continue;
            if (rule.maxTurns !== undefined && (context.turnCount ?? 0) > rule.maxTurns) {
                return asDecision(rule, rule.reason || `Policy denied: exceeded max turns (${rule.maxTurns}).`);
            }
            if (rule.maxCostUsd !== undefined && (context.costUsd ?? 0) > rule.maxCostUsd) {
                return asDecision(rule, rule.reason || `Policy denied: exceeded max cost ($${rule.maxCostUsd}).`);
            }
        }
        return null;
    }

    public evaluateTool(context: ToolPolicyContext): PolicyDecision | null {
        for (const rule of this.rules) {
            if (!matchesShared(rule, context)) continue;
            if (rule.tools && rule.tools.length > 0 && !rule.tools.includes(context.toolName)) {
                continue;
            }
            if (rule.maxTurns !== undefined && (context.turnCount ?? 0) > rule.maxTurns) {
                return asDecision(rule, rule.reason || `Policy denied: exceeded max turns (${rule.maxTurns}).`);
            }
            if (rule.maxCostUsd !== undefined && (context.costUsd ?? 0) > rule.maxCostUsd) {
                return asDecision(rule, rule.reason || `Policy denied: exceeded max cost ($${rule.maxCostUsd}).`);
            }
            return asDecision(rule, rule.reason || `Policy ${rule.effect}ed tool ${context.toolName}`);
        }
        return null;
    }
}

function matchesShared(rule: PolicyRule, context: PolicyContext): boolean {
    if (rule.agents && rule.agents.length > 0) {
        if (!context.agentName || !rule.agents.includes(context.agentName)) return false;
    }
    if (rule.modes && rule.modes.length > 0) {
        if (!context.permissionMode || !rule.modes.includes(context.permissionMode)) return false;
    }
    return true;
}

function asDecision(rule: PolicyRule, fallbackReason: string): PolicyDecision {
    return {
        behavior: rule.effect,
        reason: fallbackReason,
        ruleId: rule.id
    };
}

