import test from "node:test";
import assert from "node:assert/strict";
import { ManagedPolicyHierarchy } from "./managed-policy.js";
import { PolicyEngine } from "./policy-engine.js";

test("managed policy hierarchy enforces enterprise precedence", () => {
    const hierarchy = new ManagedPolicyHierarchy([
        {
            tier: "workspace",
            rules: [
                {
                    id: "allow-read",
                    effect: "allow",
                    tools: ["read_file"]
                }
            ]
        },
        {
            tier: "enterprise",
            rules: [
                {
                    id: "deny-read",
                    effect: "deny",
                    tools: ["read_file"],
                    reason: "Blocked by enterprise policy"
                }
            ]
        }
    ]);

    const compiled = hierarchy.compile();
    const engine = new PolicyEngine(compiled.rules, compiled.prefixRules);
    const decision = engine.evaluateTool({
        toolName: "read_file",
        permissionMode: "default"
    });
    assert.equal(decision?.behavior, "deny");
    assert.match(decision?.reason || "", /enterprise/i);
    assert.equal(decision?.ruleId, "enterprise:deny-read");
});

test("managed policy hierarchy composes prefix rules with tier-qualified IDs", () => {
    const hierarchy = new ManagedPolicyHierarchy([
        {
            tier: "admin",
            prefixRules: [
                {
                    id: "deny-rm",
                    decision: "forbidden",
                    pattern: ["rm"],
                    justification: "no remove"
                }
            ]
        }
    ]);
    const compiled = hierarchy.compile();
    const engine = new PolicyEngine(compiled.rules, compiled.prefixRules);
    const decision = engine.evaluateTool({
        toolName: "bash",
        input: { command: "rm -rf /tmp/test" },
        permissionMode: "default"
    });
    assert.equal(decision?.behavior, "deny");
    assert.equal(decision?.ruleId, "admin:deny-rm");
});
