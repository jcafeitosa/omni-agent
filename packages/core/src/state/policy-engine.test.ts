import test from "node:test";
import assert from "node:assert/strict";
import { PolicyEngine } from "./policy-engine.js";

test("policy engine enforces prefix rules for bash commands", () => {
    const engine = new PolicyEngine([], [
        {
            id: "deny-rm-rf",
            pattern: ["rm", "-rf"],
            decision: "forbidden",
            justification: "Destructive command blocked."
        },
        {
            id: "prompt-git-push",
            pattern: ["git", "push"],
            decision: "prompt",
            justification: "Push requires explicit approval."
        }
    ]);

    const denied = engine.evaluateTool({
        toolName: "bash",
        input: { command: "rm -rf /tmp/x" },
        permissionMode: "default"
    });
    assert.equal(denied?.behavior, "deny");
    assert.match(denied?.reason || "", /blocked/i);

    const prompted = engine.evaluateTool({
        toolName: "bash",
        input: { command: "git push origin main" },
        permissionMode: "default"
    });
    assert.equal(prompted?.behavior, "deny");
    assert.equal((prompted?.suggestions || []).length > 0, true);

    const allowed = engine.evaluateTool({
        toolName: "bash",
        input: { command: "git status" },
        permissionMode: "default"
    });
    assert.equal(allowed, null);
});
