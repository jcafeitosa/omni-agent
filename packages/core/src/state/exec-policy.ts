export type ExecPolicyDecision = "allow" | "prompt" | "forbidden";

export interface PrefixRule {
    id: string;
    pattern: Array<string | string[]>;
    decision?: ExecPolicyDecision;
    justification?: string;
    match?: Array<string[] | string>;
    notMatch?: Array<string[] | string>;
}

export interface PrefixRuleMatch {
    ruleId: string;
    matchedPrefix: string[];
    decision: ExecPolicyDecision;
    justification?: string;
}

export interface ExecPolicyEvaluation {
    matchedRules: PrefixRuleMatch[];
    decision?: ExecPolicyDecision;
}

export interface PrefixRuleValidationError {
    ruleId: string;
    reason: string;
}

function tokenize(input: string): string[] {
    return input.trim().split(/\s+/).filter(Boolean);
}

function toTokens(input: string[] | string): string[] {
    return Array.isArray(input) ? input : tokenize(input);
}

function severity(decision: ExecPolicyDecision): number {
    if (decision === "forbidden") return 3;
    if (decision === "prompt") return 2;
    return 1;
}

export class PrefixPolicyEngine {
    private readonly rules: PrefixRule[] = [];

    constructor(rules: PrefixRule[] = []) {
        for (const rule of rules) {
            this.addRule(rule);
        }
    }

    public addRule(rule: PrefixRule): void {
        this.rules.push({
            ...rule,
            decision: rule.decision || "allow"
        });
    }

    public listRules(): PrefixRule[] {
        return [...this.rules];
    }

    public validateRules(): PrefixRuleValidationError[] {
        const errors: PrefixRuleValidationError[] = [];
        for (const rule of this.rules) {
            const positives = rule.match || [];
            const negatives = rule.notMatch || [];

            for (const sample of positives) {
                const matched = this.matchesPrefix(rule.pattern, toTokens(sample));
                if (!matched) {
                    errors.push({
                        ruleId: rule.id,
                        reason: `sample in match does not satisfy prefix: ${JSON.stringify(sample)}`
                    });
                }
            }
            for (const sample of negatives) {
                const matched = this.matchesPrefix(rule.pattern, toTokens(sample));
                if (matched) {
                    errors.push({
                        ruleId: rule.id,
                        reason: `sample in notMatch unexpectedly satisfies prefix: ${JSON.stringify(sample)}`
                    });
                }
            }
        }
        return errors;
    }

    public evaluate(input: string[] | string): ExecPolicyEvaluation {
        const tokens = toTokens(input);
        const matchedRules: PrefixRuleMatch[] = [];

        for (const rule of this.rules) {
            if (!this.matchesPrefix(rule.pattern, tokens)) continue;
            matchedRules.push({
                ruleId: rule.id,
                matchedPrefix: this.expandConcretePrefix(rule.pattern, tokens),
                decision: rule.decision || "allow",
                justification: rule.justification
            });
        }

        if (matchedRules.length === 0) {
            return { matchedRules };
        }

        const decision = matchedRules
            .map((m) => m.decision)
            .sort((a, b) => severity(b) - severity(a))[0];

        return {
            matchedRules,
            decision
        };
    }

    private matchesPrefix(pattern: Array<string | string[]>, tokens: string[]): boolean {
        if (tokens.length < pattern.length) return false;
        for (let i = 0; i < pattern.length; i++) {
            const wanted = pattern[i];
            const token = tokens[i];
            if (Array.isArray(wanted)) {
                if (!wanted.includes(token)) return false;
            } else {
                if (wanted !== token) return false;
            }
        }
        return true;
    }

    private expandConcretePrefix(pattern: Array<string | string[]>, tokens: string[]): string[] {
        return pattern.map((p, i) => (Array.isArray(p) ? tokens[i] : p));
    }
}
