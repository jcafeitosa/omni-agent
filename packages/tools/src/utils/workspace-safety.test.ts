import test from "node:test";
import assert from "node:assert/strict";
import { resolveWorkspacePath } from "./workspace-path.js";
import { assertWorkspaceSafePattern } from "./pattern-safety.js";

test("resolveWorkspacePath allows in-workspace relative paths", () => {
    const cwd = "/repo/project";
    const resolved = resolveWorkspacePath(cwd, "src/index.ts");
    assert.equal(resolved, "/repo/project/src/index.ts");
});

test("resolveWorkspacePath blocks parent traversal", () => {
    const cwd = "/repo/project";
    assert.throws(
        () => resolveWorkspacePath(cwd, "../secrets.txt"),
        /escapes workspace/i
    );
});

test("assertWorkspaceSafePattern blocks unsafe patterns", () => {
    assert.throws(() => assertWorkspaceSafePattern("../**/*.ts"), /escapes workspace/i);
    assert.throws(() => assertWorkspaceSafePattern("/etc/passwd"), /escapes workspace/i);
});

test("assertWorkspaceSafePattern accepts common relative globs", () => {
    assert.doesNotThrow(() => assertWorkspaceSafePattern("src/**/*.ts"));
    assert.doesNotThrow(() => assertWorkspaceSafePattern("*.md"));
});

