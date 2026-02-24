import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContextLoader } from "./context-loader.js";

test("context loader loads constitution from nearest parent", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-context-loader-"));
    const nested = join(root, "a", "b");
    await mkdir(nested, { recursive: true });
    await writeFile(join(root, "CLAUDE.md"), "project constitution", "utf8");

    const loader = new ContextLoader();
    const content = loader.loadConstitution(nested);
    assert.equal(content, "project constitution");
});

test("context loader loads bootstrap context from workspace files", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-context-loader-bootstrap-"));
    await writeFile(join(root, "IDENTITY.md"), "identity section", "utf8");
    await writeFile(join(root, "SOUL.md"), "soul section", "utf8");

    const loader = new ContextLoader();
    const content = loader.loadBootstrapContext(root);
    assert.match(content, /IDENTITY\.md/);
    assert.match(content, /SOUL\.md/);
    assert.match(content, /identity section/);
});

