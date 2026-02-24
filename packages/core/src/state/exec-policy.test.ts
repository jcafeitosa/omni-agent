import test from "node:test";
import assert from "node:assert/strict";
import { PrefixPolicyEngine } from "./exec-policy.js";

test("prefix policy evaluates strictest decision among matches", () => {
    const engine = new PrefixPolicyEngine([
        { id: "allow-git", pattern: ["git"], decision: "allow" },
        { id: "prompt-git-push", pattern: ["git", "push"], decision: "prompt" },
        { id: "deny-git-push-force", pattern: ["git", "push", "--force"], decision: "forbidden" }
    ]);

    const evalAllow = engine.evaluate("git status");
    assert.equal(evalAllow.decision, "allow");

    const evalPrompt = engine.evaluate("git push origin main");
    assert.equal(evalPrompt.decision, "prompt");

    const evalForbidden = engine.evaluate("git push --force origin main");
    assert.equal(evalForbidden.decision, "forbidden");
});

test("prefix policy supports alternatives in pattern", () => {
    const engine = new PrefixPolicyEngine([
        { id: "deny-rm", pattern: [["rm", "rmdir"], "-rf"], decision: "forbidden" }
    ]);
    assert.equal(engine.evaluate("rm -rf /tmp/x").decision, "forbidden");
    assert.equal(engine.evaluate("rmdir -rf x").decision, "forbidden");
    assert.equal(engine.evaluate("rm -r x").decision, undefined);
});

test("prefix policy validates match/notMatch samples", () => {
    const engine = new PrefixPolicyEngine([
        {
            id: "rule",
            pattern: ["git", "push"],
            decision: "prompt",
            match: [["git", "push"], "git push origin main"],
            notMatch: [["git", "status"], "git fetch"]
        }
    ]);
    const errors = engine.validateRules();
    assert.deepEqual(errors, []);
});
