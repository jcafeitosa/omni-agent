import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

export type TaskBoardStatus = "todo" | "in_progress" | "blocked" | "done";

export interface TaskItem {
    id: string;
    title: string;
    status: TaskBoardStatus;
    tags?: string[];
    updatedAt: number;
}

export interface TasksBoardOptions {
    filePath?: string;
}

export class TasksBoard {
    private readonly filePath: string;
    private tasks: TaskItem[] = [];

    constructor(options: TasksBoardOptions = {}) {
        this.filePath = resolve(options.filePath || "TASKS.md");
    }

    public async load(): Promise<TaskItem[]> {
        if (!existsSync(this.filePath)) {
            this.tasks = [];
            return [];
        }
        const raw = await readFile(this.filePath, "utf8");
        this.tasks = parseTasksMarkdown(raw);
        return this.list();
    }

    public list(status?: TaskBoardStatus): TaskItem[] {
        const all = [...this.tasks].sort((a, b) => a.updatedAt - b.updatedAt);
        if (!status) return all;
        return all.filter((task) => task.status === status);
    }

    public add(title: string, options: { id?: string; status?: TaskBoardStatus; tags?: string[] } = {}): TaskItem {
        const task: TaskItem = {
            id: options.id || makeTaskId(title),
            title: title.trim(),
            status: options.status || "todo",
            tags: normalizeTags(options.tags),
            updatedAt: Date.now()
        };
        this.tasks.push(task);
        return task;
    }

    public upsert(task: TaskItem): void {
        const idx = this.tasks.findIndex((candidate) => candidate.id === task.id);
        if (idx >= 0) {
            this.tasks[idx] = { ...task, updatedAt: Date.now() };
            return;
        }
        this.tasks.push({ ...task, updatedAt: Date.now() });
    }

    public setStatus(id: string, status: TaskBoardStatus): TaskItem | undefined {
        const task = this.tasks.find((candidate) => candidate.id === id);
        if (!task) return undefined;
        task.status = status;
        task.updatedAt = Date.now();
        return task;
    }

    public remove(id: string): boolean {
        const start = this.tasks.length;
        this.tasks = this.tasks.filter((task) => task.id !== id);
        return this.tasks.length !== start;
    }

    public render(): string {
        return renderTasksMarkdown(this.tasks);
    }

    public async save(): Promise<void> {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, this.render(), "utf8");
    }

    public stats(): Record<TaskBoardStatus, number> {
        return {
            todo: this.list("todo").length,
            in_progress: this.list("in_progress").length,
            blocked: this.list("blocked").length,
            done: this.list("done").length
        };
    }
}

export function parseTasksMarkdown(markdown: string): TaskItem[] {
    const lines = markdown.split(/\r?\n/);
    const tasks: TaskItem[] = [];
    let currentStatus: TaskBoardStatus = "todo";

    for (const line of lines) {
        const section = line.match(/^##\s+(.*)$/i);
        if (section) {
            currentStatus = mapHeadingToStatus(section[1] || "");
            continue;
        }

        const item = line.match(/^[-*]\s+\[( |x|X)\]\s+\[([^\]]+)\]\s+(.+)$/);
        if (!item) continue;

        const checked = String(item[1] || "").toLowerCase() === "x";
        const id = String(item[2] || "").trim();
        if (id === "empty") {
            continue;
        }
        const fullTitle = String(item[3] || "").trim();
        const tags = extractTags(fullTitle);
        const title = fullTitle.replace(/\s+#([a-zA-Z0-9:_-]+)/g, "").trim();
        tasks.push({
            id,
            title,
            status: checked ? "done" : currentStatus,
            tags,
            updatedAt: Date.now()
        });
    }

    return tasks;
}

export function renderTasksMarkdown(tasks: TaskItem[]): string {
    const sections: Array<{ status: TaskBoardStatus; heading: string }> = [
        { status: "todo", heading: "Todo" },
        { status: "in_progress", heading: "In Progress" },
        { status: "blocked", heading: "Blocked" },
        { status: "done", heading: "Done" }
    ];

    const lines: string[] = ["# TASKS", "", "Use este arquivo como backlog operacional.", ""];

    for (const section of sections) {
        lines.push(`## ${section.heading}`);
        const inSection = tasks.filter((task) => task.status === section.status);
        if (inSection.length === 0) {
            lines.push("- [ ] [empty] (no tasks)");
            lines.push("");
            continue;
        }
        for (const task of inSection) {
            const mark = task.status === "done" ? "x" : " ";
            const tags = task.tags?.length ? ` ${task.tags.map((tag) => `#${tag}`).join(" ")}` : "";
            lines.push(`- [${mark}] [${task.id}] ${task.title}${tags}`);
        }
        lines.push("");
    }

    return `${lines.join("\n").trim()}\n`;
}

function mapHeadingToStatus(value: string): TaskBoardStatus {
    const normalized = value.trim().toLowerCase();
    if (normalized.includes("progress") || normalized === "doing") return "in_progress";
    if (normalized.includes("block")) return "blocked";
    if (normalized.includes("done") || normalized.includes("complete")) return "done";
    return "todo";
}

function extractTags(value: string): string[] | undefined {
    const tags = Array.from(new Set(Array.from(value.matchAll(/#([a-zA-Z0-9:_-]+)/g)).map((m) => m[1])));
    return tags.length > 0 ? tags : undefined;
}

function makeTaskId(title: string): string {
    const normalized = title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return normalized || `task-${Math.floor(Date.now() / 1000)}`;
}

function normalizeTags(tags?: string[]): string[] | undefined {
    if (!tags || tags.length === 0) return undefined;
    const normalized = Array.from(new Set(tags.map((tag) => String(tag || "").trim().replace(/^#/, "")).filter(Boolean)));
    return normalized.length > 0 ? normalized : undefined;
}
