import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HookManager } from "./hook-manager.js";

test("hook manager blocks tool use from declarative local rule", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-hook-manager-"));
    try {
        const rulesDir = join(root, ".omniagent", "hooks");
        await mkdir(rulesDir, { recursive: true });
        await writeFile(
            join(rulesDir, "hookify.block.local.md"),
            `---\nname: block-rm\nenabled: true\nevent: pre_tool_use\naction: block\ntool_matcher: Bash\nconditions:\n  - field: tool_input.command\n    operator: regex_match\n    pattern: 'rm\\s+-rf'\n---\nNo destructive remove commands.\n`,
            "utf8"
        );

        const manager = new HookManager({ cwd: root });
        const result = await manager.emit("PreToolUse", {
            tool: "Bash",
            args: { command: "rm -rf /tmp/x" }
        });

        assert.equal(result.block, true);
        assert.match(String(result.reason || ""), /destructive remove/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("hook manager merges warning message from declarative rule", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-hook-manager-"));
    try {
        const rulesDir = join(root, ".omniagent", "hooks");
        await mkdir(rulesDir, { recursive: true });
        await writeFile(
            join(rulesDir, "hookify.warn.local.md"),
            `---\nname: warn-console\nenabled: true\nevent: post_tool_use\naction: warn\nconditions:\n  - field: tool_input.content\n    operator: contains\n    pattern: console.log\n---\nAvoid debug logs before commit.\n`,
            "utf8"
        );

        const manager = new HookManager({ cwd: root });
        const result = await manager.emit("PostToolUse", {
            tool: "Write",
            args: { content: "console.log('x')" }
        });

        assert.equal(result.block, undefined);
        assert.match(String(result.systemMessage || ""), /Avoid debug logs/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
