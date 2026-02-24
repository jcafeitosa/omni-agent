import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SkillManager } from "./skill-manager.js";

test("skill manager disambiguates duplicate names across plugin scopes", () => {
    const root = mkdtempSync(join(tmpdir(), "omni-skill-manager-test-"));
    const p1 = join(root, "plugins", "plugin-a", "skills", "writer");
    const p2 = join(root, "plugins", "plugin-b", "skills", "writer");
    mkdirSync(p1, { recursive: true });
    mkdirSync(p2, { recursive: true });
    writeFileSync(
        join(p1, "SKILL.md"),
        `---
name: writer
description: first
---
Skill A
`
    );
    writeFileSync(
        join(p2, "SKILL.md"),
        `---
name: writer
description: second
allowed-tools: read_file,write_file
---
Skill B
`
    );

    try {
        const manager = new SkillManager({ directories: [join(root, "plugins")] });
        const skills = manager.loadAll();
        const names = skills.map((s) => s.name).sort();
        assert.equal(names.includes("writer"), true);
        assert.equal(names.some((n) => n.startsWith("writer@plugin-b")), true);

        const scoped = skills.find((s) => s.name.startsWith("writer@plugin-b"));
        assert.deepEqual(scoped?.allowedTools, ["read_file", "write_file"]);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

