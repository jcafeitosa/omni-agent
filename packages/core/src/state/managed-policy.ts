import type { PrefixRule } from "./exec-policy.js";
import type { PolicyRule } from "./policy-engine.js";

export type PolicyTier = "builtin" | "workspace" | "user" | "admin" | "enterprise";

export interface ManagedPolicyBundle {
    tier: PolicyTier;
    rules?: PolicyRule[];
    prefixRules?: PrefixRule[];
}

export interface CompiledPolicySet {
    rules: PolicyRule[];
    prefixRules: PrefixRule[];
}

const TIER_WEIGHT: Record<PolicyTier, number> = {
    builtin: 1_000_000,
    workspace: 2_000_000,
    user: 3_000_000,
    admin: 4_000_000,
    enterprise: 5_000_000
};

export class ManagedPolicyHierarchy {
    private readonly bundles: ManagedPolicyBundle[] = [];

    constructor(bundles: ManagedPolicyBundle[] = []) {
        for (const bundle of bundles) {
            this.addBundle(bundle);
        }
    }

    public addBundle(bundle: ManagedPolicyBundle): void {
        this.bundles.push({
            tier: bundle.tier,
            rules: [...(bundle.rules || [])],
            prefixRules: [...(bundle.prefixRules || [])]
        });
    }

    public listBundles(): ManagedPolicyBundle[] {
        return this.bundles.map((bundle) => ({
            tier: bundle.tier,
            rules: [...(bundle.rules || [])],
            prefixRules: [...(bundle.prefixRules || [])]
        }));
    }

    public compile(): CompiledPolicySet {
        const rules: PolicyRule[] = [];
        const prefixRules: PrefixRule[] = [];
        for (const bundle of this.bundles) {
            const tierWeight = TIER_WEIGHT[bundle.tier];
            for (const rule of bundle.rules || []) {
                rules.push({
                    ...rule,
                    id: `${bundle.tier}:${rule.id}`,
                    // higher tier always wins; within same tier keep explicit priority then prefer deny
                    priority:
                        tierWeight +
                        (rule.priority ?? 0) +
                        (rule.effect === "deny" ? 1 : 0)
                });
            }
            for (const rule of bundle.prefixRules || []) {
                prefixRules.push({
                    ...rule,
                    id: `${bundle.tier}:${rule.id}`
                });
            }
        }
        return { rules, prefixRules };
    }
}
