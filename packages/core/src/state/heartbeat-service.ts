import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { join } from "node:path";

export interface HeartbeatResult {
    status: "ok" | "error" | "silent";
    message?: string;
}

export type HeartbeatHandler = (prompt: string) => Promise<HeartbeatResult>;

export interface HeartbeatServiceOptions {
    workspaceDir: string;
    intervalMs?: number;
    enabled?: boolean;
    onHeartbeat: HeartbeatHandler;
}

export class HeartbeatService {
    private readonly workspaceDir: string;
    private readonly intervalMs: number;
    private readonly enabled: boolean;
    private readonly onHeartbeat: HeartbeatHandler;
    private timer?: NodeJS.Timeout;
    private running = false;

    constructor(options: HeartbeatServiceOptions) {
        this.workspaceDir = options.workspaceDir;
        this.intervalMs = Math.max(5_000, options.intervalMs ?? 30 * 60_000);
        this.enabled = options.enabled !== false;
        this.onHeartbeat = options.onHeartbeat;
    }

    public isRunning(): boolean {
        return this.running;
    }

    public async start(): Promise<void> {
        if (this.running || !this.enabled) return;
        this.running = true;
        await this.ensureTemplate();
        this.schedule(1_000);
    }

    public stop(): void {
        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }

    public async executeNow(): Promise<HeartbeatResult | null> {
        const content = await this.loadHeartbeatContent();
        if (!content.trim()) return null;
        const prompt = this.buildPrompt(content);
        return this.onHeartbeat(prompt);
    }

    private schedule(delayMs: number): void {
        if (!this.running) return;
        this.timer = setTimeout(async () => {
            try {
                await this.executeNow();
            } finally {
                this.schedule(this.intervalMs);
            }
        }, delayMs);
    }

    private buildPrompt(content: string): string {
        const now = new Date().toISOString();
        return `# Heartbeat Check\n\nCurrent time: ${now}\n\nYou are running a scheduled check. If no action is required, return HEARTBEAT_OK.\n\n${content}`;
    }

    private async loadHeartbeatContent(): Promise<string> {
        const filePath = join(this.workspaceDir, "HEARTBEAT.md");
        try {
            return await fs.readFile(filePath, "utf8");
        } catch {
            return "";
        }
    }

    private async ensureTemplate(): Promise<void> {
        const filePath = join(this.workspaceDir, "HEARTBEAT.md");
        if (existsSync(filePath)) return;
        const template = `# Heartbeat Tasks\n\n- Review pending operational tasks\n- Check for reminders and scheduled actions\n- If nothing is needed, return HEARTBEAT_OK\n`;
        await fs.mkdir(this.workspaceDir, { recursive: true });
        await fs.writeFile(filePath, template, "utf8");
    }
}

