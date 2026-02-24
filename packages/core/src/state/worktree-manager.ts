import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface WorktreeManagerOptions {
    rootDir?: string;
    worktreesDir?: string;
}

export interface CreatedWorktree {
    taskId: string;
    path: string;
    branch: string;
}

export class WorktreeManager {
    private readonly rootDir: string;
    private readonly worktreesDir: string;

    constructor(options: WorktreeManagerOptions = {}) {
        this.rootDir = resolve(options.rootDir || process.cwd());
        this.worktreesDir = resolve(options.worktreesDir || join(this.rootDir, ".omniagent", "worktrees"));
    }

    public async create(taskId: string): Promise<CreatedWorktree> {
        await fs.mkdir(this.worktreesDir, { recursive: true });
        const path = join(this.worktreesDir, sanitize(taskId));
        const branch = `omni-agent/${sanitize(taskId)}`;

        if (existsSync(path)) {
            return { taskId, path, branch };
        }

        await execFileAsync("git", ["worktree", "add", "--detach", path], { cwd: this.rootDir });
        return { taskId, path, branch };
    }

    public async remove(path: string): Promise<void> {
        if (!existsSync(path)) return;
        await execFileAsync("git", ["worktree", "remove", "--force", path], { cwd: this.rootDir });
    }
}

function sanitize(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

