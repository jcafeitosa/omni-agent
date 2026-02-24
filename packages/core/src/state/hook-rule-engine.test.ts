import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HookRuleEngine, parseRuleFile } from "./hook-rule-engine.js";

test("hook rule engine parses and blocks matching rule", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-hook-rule-"));
    try {
        const dir = join(root, ".omniagent", "hooks");
        await mkdir(dir, { recursive: true });
        const file = join(dir, "hookify.block-rm.local.md");
        await writeFile(
            file,
            `---\nname: block-rm\nenabled: true\nevent: pre_tool_use\naction: block\ntool_matcher: Bash\nconditions:\n  - field: tool_input.command\n    operator: regex_match\n    pattern: 'rm\\s+-rf'\n---\nDangerous command blocked.\n`,
            "utf8"
        );

        const engine = new HookRuleEngine({ rulesDirectories: [dir] });
        const rules = engine.loadRules("pre_tool_use");
        const result = engine.evaluate(rules, {
            tool_name: "Bash",
            tool_input: { command: "rm -rf /tmp/a" }
        });
        assert.equal(result.blocked, true);
        assert.match(String(result.blockReason || ""), /Dangerous command blocked/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("hook rule engine supports warn action and legacy pattern", async () => {
    const parsed = await parseRuleFileFromText(`---\nname: warn-debug\nenabled: true\nevent: file\npattern: console\\.log\\(\naction: warn\n---\nDebug statement detected.\n`);
    assert.ok(parsed);
    const engine = new HookRuleEngine();
    const result = engine.evaluate([parsed!], {
        tool_name: "Write",
        tool_input: { content: "console.log('x')" }
    });
    assert.equal(result.blocked, false);
    assert.equal(result.warnings.length, 1);
});

function parseRuleFileFromText(content: string) {
    const root = join(tmpdir(), `omni-rule-inline-${Date.now()}-${Math.random()}.md`);
    return writeFile(root, content, "utf8")
        .then(() => parseRuleFile(root))
        .finally(() => rm(root, { force: true }));
}
