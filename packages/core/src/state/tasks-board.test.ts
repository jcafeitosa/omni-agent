import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TasksBoard, parseTasksMarkdown, renderTasksMarkdown } from "./tasks-board.js";

test("tasks markdown parser extracts statuses, ids and tags", () => {
    const parsed = parseTasksMarkdown(`# TASKS\n\n## Todo\n- [ ] [plan-routing] Implement routing #core\n\n## Done\n- [x] [ship-v1] Release package #release\n`);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].status, "todo");
    assert.equal(parsed[1].status, "done");
    assert.deepEqual(parsed[0].tags, ["core"]);
});

test("tasks board supports load mutate save", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-tasks-"));
    const filePath = join(dir, "TASKS.md");
    try {
        const board = new TasksBoard({ filePath });
        await board.load();
        const created = board.add("Create plugin marketplace", { status: "in_progress", tags: ["plugins"] });
        board.setStatus(created.id, "done");
        await board.save();

        const other = new TasksBoard({ filePath });
        await other.load();
        const all = other.list();
        assert.equal(all.length, 1);
        assert.equal(all[0].status, "done");

        const rendered = renderTasksMarkdown(all);
        assert.match(rendered, /## Done/);
        assert.match(rendered, /#plugins/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
