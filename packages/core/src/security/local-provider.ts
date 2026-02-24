import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Sandbox, SandboxExecutionResult, SandboxProvider } from "./sandbox.js";

const execAsync = promisify(exec);

export class LocalSandbox implements Sandbox {
    constructor(private workspaceDir: string) { }

    private validatePath(filePath: string) {
        const fullPath = path.resolve(this.workspaceDir, filePath);
        if (!fullPath.startsWith(this.workspaceDir)) {
            throw new Error(`Access denied: Path ${filePath} is outside the sandbox.`);
        }
        return fullPath;
    }

    async exec(command: string, options: { cwd?: string; env?: Record<string, string> } = {}): Promise<SandboxExecutionResult> {
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: options.cwd ? this.validatePath(options.cwd) : this.workspaceDir,
                env: { ...process.env, ...options.env }
            });
            return { stdout, stderr, exitCode: 0 };
        } catch (error: any) {
            return {
                stdout: error.stdout || "",
                stderr: error.stderr || error.message,
                exitCode: error.code || 1
            };
        }
    }

    async readFile(filePath: string): Promise<string> {
        const fullPath = this.validatePath(filePath);
        return fs.readFile(fullPath, "utf-8");
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        const fullPath = this.validatePath(filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
    }

    async destroy(): Promise<void> {
        // No-op for local sandbox usually, or cleanup temp files
    }
}

export class LocalSandboxProvider implements SandboxProvider {
    name = "local";
    async createSandbox(options?: { workspaceDir?: string }): Promise<Sandbox> {
        return new LocalSandbox(options?.workspaceDir || process.cwd());
    }
}
