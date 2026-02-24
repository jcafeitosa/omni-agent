import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";

export type HookRuleAction = "warn" | "block";

export interface HookRuleCondition {
    field: string;
    operator: "regex_match" | "contains" | "equals" | "not_contains" | "starts_with" | "ends_with";
    pattern: string;
}

export interface HookRule {
    name: string;
    enabled: boolean;
    event: string;
    action: HookRuleAction;
    toolMatcher?: string;
    conditions: HookRuleCondition[];
    message: string;
}

export interface HookRuleEvaluation {
    blocked: boolean;
    blockReason?: string;
    warnings: string[];
    matchedRuleNames: string[];
}

export interface HookRuleEngineOptions {
    rulesDirectories?: string[];
}

export class HookRuleEngine {
    private readonly rulesDirectories: string[];

    constructor(options: HookRuleEngineOptions = {}) {
        this.rulesDirectories = options.rulesDirectories || [];
    }

    public loadRules(event: string): HookRule[] {
        const loaded: HookRule[] = [];
        for (const dir of this.rulesDirectories) {
            if (!existsSync(dir)) continue;
            const files = readdirSync(dir)
                .filter((name) => name.endsWith(".local.md") || name.endsWith(".rule.md"))
                .sort();
            for (const fileName of files) {
                const filePath = join(dir, fileName);
                const rule = parseRuleFile(filePath);
                if (!rule || !rule.enabled) continue;
                if (!matchesEvent(rule.event, event)) continue;
                loaded.push(rule);
            }
        }
        return loaded;
    }

    public evaluate(rules: HookRule[], context: Record<string, unknown>): HookRuleEvaluation {
        const warnings: string[] = [];
        const blockingMessages: string[] = [];
        const matchedRuleNames: string[] = [];

        for (const rule of rules) {
            if (!this.matchesRule(rule, context)) continue;
            matchedRuleNames.push(rule.name);
            if (rule.action === "block") {
                blockingMessages.push(formatRuleMessage(rule));
            } else {
                warnings.push(formatRuleMessage(rule));
            }
        }

        const blocked = blockingMessages.length > 0;
        return {
            blocked,
            blockReason: blocked ? blockingMessages.join("\n\n") : undefined,
            warnings,
            matchedRuleNames
        };
    }

    private matchesRule(rule: HookRule, context: Record<string, unknown>): boolean {
        if (rule.toolMatcher && !matchesTool(rule.toolMatcher, String(context.tool_name || ""))) {
            return false;
        }
        if (!rule.conditions.length) return false;
        for (const condition of rule.conditions) {
            if (!matchesCondition(condition, context)) return false;
        }
        return true;
    }
}

export function parseRuleFile(filePath: string): HookRule | undefined {
    try {
        const content = readFileSync(filePath, "utf8");
        const parsed = parseFrontmatter(content);
        if (!parsed) return undefined;
        const meta = parsed.meta || {};
        const event = String(meta.event || "all").trim().toLowerCase();
        const action = normalizeAction(meta.action);
        const toolMatcher = meta.tool_matcher ? String(meta.tool_matcher) : undefined;
        const explicitConditions = normalizeConditions(meta.conditions);
        const fallbackConditions = explicitConditions.length > 0 ? explicitConditions : legacyPatternToCondition(meta.pattern, event);
        const name = String(meta.name || filePath.split("/").pop() || "unnamed-rule").trim();
        const enabled = meta.enabled !== false;
        if (!fallbackConditions.length) return undefined;
        return {
            name,
            enabled,
            event,
            action,
            toolMatcher,
            conditions: fallbackConditions,
            message: parsed.body.trim()
        };
    } catch {
        return undefined;
    }
}

function parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } | undefined {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return undefined;
    const meta = (yaml.load(match[1]) as Record<string, unknown>) || {};
    return { meta, body: match[2] || "" };
}

function normalizeAction(value: unknown): HookRuleAction {
    const raw = String(value || "warn").trim().toLowerCase();
    return raw === "block" ? "block" : "warn";
}

function normalizeConditions(value: unknown): HookRuleCondition[] {
    if (!Array.isArray(value)) return [];
    const conditions: HookRuleCondition[] = [];
    for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const raw = item as Record<string, unknown>;
        const field = String(raw.field || "").trim();
        const operator = String(raw.operator || "regex_match").trim() as HookRuleCondition["operator"];
        const pattern = String(raw.pattern || "").trim();
        if (!field || !pattern) continue;
        if (!["regex_match", "contains", "equals", "not_contains", "starts_with", "ends_with"].includes(operator)) continue;
        conditions.push({ field, operator, pattern });
    }
    return conditions;
}

function legacyPatternToCondition(value: unknown, event: string): HookRuleCondition[] {
    const pattern = String(value || "").trim();
    if (!pattern) return [];
    const field = event === "bash" || event === "pre_tool_use" ? "tool_input.command" : "tool_input.content";
    return [{ field, operator: "regex_match", pattern }];
}

function matchesEvent(ruleEvent: string, runtimeEvent: string): boolean {
    const event = ruleEvent.trim().toLowerCase();
    const runtime = runtimeEvent.trim().toLowerCase();
    if (event === "all") return true;
    return event === runtime;
}

function matchesTool(matcher: string, toolName: string): boolean {
    if (!matcher || matcher === "*") return true;
    const choices = matcher.split("|").map((item) => item.trim()).filter(Boolean);
    return choices.includes(toolName);
}

function matchesCondition(condition: HookRuleCondition, context: Record<string, unknown>): boolean {
    const raw = resolvePath(context, condition.field);
    if (raw === undefined || raw === null) return false;
    const value = String(raw);
    if (condition.operator === "contains") return value.includes(condition.pattern);
    if (condition.operator === "equals") return value === condition.pattern;
    if (condition.operator === "not_contains") return !value.includes(condition.pattern);
    if (condition.operator === "starts_with") return value.startsWith(condition.pattern);
    if (condition.operator === "ends_with") return value.endsWith(condition.pattern);
    try {
        return new RegExp(condition.pattern, "i").test(value);
    } catch {
        return false;
    }
}

function resolvePath(context: Record<string, unknown>, path: string): unknown {
    const normalized = path.trim();
    if (!normalized) return undefined;
    const parts = normalized.split(".");
    let cursor: unknown = context;
    for (const part of parts) {
        if (!cursor || typeof cursor !== "object") return undefined;
        cursor = (cursor as Record<string, unknown>)[part];
    }
    return cursor;
}

function formatRuleMessage(rule: HookRule): string {
    if (!rule.message) return `[${rule.name}] rule matched`;
    return `[${rule.name}] ${rule.message}`;
}
