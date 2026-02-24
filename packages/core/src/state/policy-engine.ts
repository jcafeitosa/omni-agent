import { PermissionMode, PermissionResult } from "./permissions.js";
import { PrefixPolicyEngine, PrefixRule } from "./exec-policy.js";

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
    private readonly prefixPolicy: PrefixPolicyEngine;

    constructor(rules: PolicyRule[] = [], prefixRules: PrefixRule[] = []) {
        this.rules = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        this.prefixPolicy = new PrefixPolicyEngine(prefixRules);
    }

    public addRule(rule: PolicyRule): void {
        this.rules.push(rule);
        this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }

    public listRules(): PolicyRule[] {
        return [...this.rules];
    }

    public addPrefixRule(rule: PrefixRule): void {
        this.prefixPolicy.addRule(rule);
    }

    public listPrefixRules(): PrefixRule[] {
        return this.prefixPolicy.listRules();
    }

    public validatePrefixRules() {
        return this.prefixPolicy.validateRules();
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
        const inputObj = context.input as any;
        const command =
            typeof inputObj?.command === "string"
                ? inputObj.command
                : typeof inputObj?.cmd === "string"
                    ? inputObj.cmd
                    : undefined;
        if (command && (context.toolName === "bash" || context.toolName === "local_shell")) {
            const evalResult = this.prefixPolicy.evaluate(command);
            if (evalResult.decision) {
                if (evalResult.decision === "allow") {
                    return {
                        behavior: "allow",
                        reason: evalResult.matchedRules[0]?.justification || "Allowed by prefix policy.",
                        ruleId: evalResult.matchedRules[0]?.ruleId
                    };
                }
                if (evalResult.decision === "prompt") {
                    return {
                        behavior: "deny",
                        reason: evalResult.matchedRules[0]?.justification || "Command requires explicit user approval by prefix policy.",
                        suggestions: [
                            { id: "exec-once", label: "Run once", mode: context.permissionMode || "default", scope: "once" }
                        ],
                        ruleId: evalResult.matchedRules[0]?.ruleId
                    };
                }
                return {
                    behavior: "deny",
                    reason: evalResult.matchedRules[0]?.justification || "Command forbidden by prefix policy.",
                    ruleId: evalResult.matchedRules[0]?.ruleId
                };
            }
        }

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
