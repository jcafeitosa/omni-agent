import { promises as fs } from "fs";
import path from "path";
import { ChildProcess, spawn } from "child_process";

export interface LocalModelInfo {
    id: string;
    path: string;
    sizeBytes?: number;
    updatedAt?: number;
}

export interface LlamaServerOptions {
    serverPath?: string;
    host?: string;
    port?: number;
    modelDir?: string;
    contextSize?: number;
    gpuLayers?: number;
    threads?: number;
}

export class LlamaCppProcessManager {
    private process: ChildProcess | null = null;
    private readonly options: Required<Pick<LlamaServerOptions, "serverPath" | "host" | "port" | "modelDir">> &
        Omit<LlamaServerOptions, "serverPath" | "host" | "port" | "modelDir">;

    constructor(options: LlamaServerOptions = {}) {
        this.options = {
            serverPath: options.serverPath || process.env.LLAMA_CPP_SERVER_PATH || "llama-server",
            host: options.host || "127.0.0.1",
            port: options.port || 8080,
            modelDir: options.modelDir || process.env.LLAMA_CPP_MODEL_DIR || path.resolve(process.cwd(), "models"),
            contextSize: options.contextSize,
            gpuLayers: options.gpuLayers,
            threads: options.threads
        };
    }

    public get baseUrl(): string {
        return `http://${this.options.host}:${this.options.port}`;
    }

    public get modelDir(): string {
        return this.options.modelDir;
    }

    public async ensureModelDir(): Promise<void> {
        await fs.mkdir(this.options.modelDir, { recursive: true });
    }

    public async modelExists(fileName: string): Promise<boolean> {
        const fullPath = path.join(this.options.modelDir, fileName);
        try {
            const stat = await fs.stat(fullPath);
            return stat.isFile();
        } catch {
            return false;
        }
    }

    public getModelOutputPath(fileName: string): string {
        return path.join(this.options.modelDir, fileName);
    }

    public async listLocalModels(): Promise<LocalModelInfo[]> {
        const entries = await walkDir(this.options.modelDir);
        const models = entries.filter((entry) => entry.toLowerCase().endsWith(".gguf"));

        return Promise.all(models.map(async (modelPath) => {
            const stat = await fs.stat(modelPath);
            return {
                id: path.basename(modelPath, path.extname(modelPath)),
                path: modelPath,
                sizeBytes: stat.size,
                updatedAt: stat.mtimeMs
            } as LocalModelInfo;
        }));
    }

    public async resolveModelPath(modelOrPath: string): Promise<string> {
        if (path.isAbsolute(modelOrPath) || modelOrPath.includes(path.sep)) {
            return modelOrPath;
        }

        const models = await this.listLocalModels();
        const found = models.find((m) => m.id === modelOrPath);
        if (!found) {
            throw new Error(`Local model not found: ${modelOrPath}. Expected a .gguf file in ${this.options.modelDir}`);
        }

        return found.path;
    }

    public async start(modelOrPath: string): Promise<void> {
        const modelPath = await this.resolveModelPath(modelOrPath);

        if (this.process && !this.process.killed) {
            return;
        }

        const args: string[] = [
            "-m", modelPath,
            "--host", this.options.host,
            "--port", String(this.options.port)
        ];

        if (this.options.contextSize) {
            args.push("-c", String(this.options.contextSize));
        }
        if (typeof this.options.gpuLayers === "number") {
            args.push("-ngl", String(this.options.gpuLayers));
        }
        if (typeof this.options.threads === "number") {
            args.push("-t", String(this.options.threads));
        }

        this.process = spawn(this.options.serverPath, args, {
            stdio: "ignore",
            detached: false
        });

        this.process.on("exit", () => {
            this.process = null;
        });
    }

    public async ensureStarted(modelOrPath: string): Promise<void> {
        const running = await this.isHealthy();
        if (!running) {
            await this.start(modelOrPath);
            await waitForHealth(this.baseUrl, 20_000);
        }
    }

    public stop(): void {
        if (!this.process) return;
        this.process.kill("SIGTERM");
        this.process = null;
    }

    public async isHealthy(): Promise<boolean> {
        try {
            const res = await fetch(`${this.baseUrl}/health`);
            return res.ok;
        } catch {
            return false;
        }
    }

    public async listServerModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseUrl}/v1/models`);
            if (!response.ok) return [];
            const json = await response.json() as { data?: Array<{ id?: string }> };
            return (json.data || []).map((m) => m.id || "").filter(Boolean);
        } catch {
            return [];
        }
    }
}

async function walkDir(root: string): Promise<string[]> {
    const result: string[] = [];

    async function walk(current: string): Promise<void> {
        const dir = await fs.readdir(current, { withFileTypes: true });
        for (const entry of dir) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
            } else {
                result.push(fullPath);
            }
        }
    }

    try {
        await walk(root);
        return result;
    } catch {
        return [];
    }
}

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`${baseUrl}/health`);
            if (res.ok) return;
        } catch {
            // retry
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    throw new Error(`llama.cpp server did not become healthy within ${timeoutMs}ms`);
}
