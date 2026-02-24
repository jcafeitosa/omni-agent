import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "./session-store.js";
import { AgentSession } from "./session.js";

test("session store saves and loads session payload", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-session-store-"));
    const filePath = join(dir, "session.json");
    const store = new SessionStore({ filePath });

    const session = new AgentSession({ systemPrompt: "system prompt" });
    session.addMessage({ role: "user", content: "hello" });
    session.addUsage({ inputTokens: 12, outputTokens: 3, thinkingTokens: 1 });

    await store.save(session);
    const loaded = await store.load();
    assert.ok(loaded);
    assert.equal(loaded?.getSystemPrompt(), "system prompt");
    assert.equal(loaded?.getMessages().length, 1);
    assert.equal(loaded?.getUsage().inputTokens, 12);
});

