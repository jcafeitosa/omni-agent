import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PluginManifest {
    name: string;
    version?: string;
    description?: string;
    homepage?: string;
    repository?: string | { type?: string; url?: string };
}

export interface ManagedPlugin {
    name: string;
    path: string;
    enabled: boolean;
    manifest?: PluginManifest;
}

interface PluginStateFile {
    version: 1;
    enabled: Record<string, boolean>;
}

export interface PluginManagerOptions {
    pluginsDir?: string;
    stateFile?: string;
}

export class PluginManager {
    private readonly pluginsDir: string;
    private readonly stateFile: string;

    constructor(options: PluginManagerOptions = {}) {
        const cwd = process.cwd();
        this.pluginsDir = resolve(options.pluginsDir || join(cwd, ".omniagent", "plugins"));
        this.stateFile = resolve(options.stateFile || join(cwd, ".omniagent", "plugins-state.json"));
    }

    public async listInstalled(): Promise<ManagedPlugin[]> {
        await fs.mkdir(this.pluginsDir, { recursive: true });
        const state = await this.readState();
        const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });
        const result: ManagedPlugin[] = [];
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const path = join(this.pluginsDir, entry.name);
            result.push({
                name: entry.name,
                path,
                enabled: state.enabled[entry.name] !== false,
                manifest: await this.readManifest(path)
            });
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }

    public async installFromPath(sourceDir: string, pluginName?: string): Promise<ManagedPlugin> {
        const resolved = resolve(sourceDir);
        const manifest = await this.readManifest(resolved);
        const name = pluginName || manifest?.name || deriveName(resolved);
        const target = join(this.pluginsDir, name);
        await fs.mkdir(this.pluginsDir, { recursive: true });
        await fs.rm(target, { recursive: true, force: true });
        await fs.cp(resolved, target, { recursive: true });

        const state = await this.readState();
        state.enabled[name] = true;
        await this.writeState(state);
        return {
            name,
            path: target,
            enabled: true,
            manifest: await this.readManifest(target)
        };
    }

    public async installFromGit(repositoryUrl: string, pluginName?: string): Promise<ManagedPlugin> {
        await fs.mkdir(this.pluginsDir, { recursive: true });
        const name = pluginName || deriveName(repositoryUrl);
        const target = join(this.pluginsDir, name);
        await fs.rm(target, { recursive: true, force: true });
        await execFileAsync("git", ["clone", repositoryUrl, target]);
        return this.installFromPath(target, name);
    }

    public async enable(name: string): Promise<void> {
        const state = await this.readState();
        state.enabled[name] = true;
        await this.writeState(state);
    }

    public async disable(name: string): Promise<void> {
        const state = await this.readState();
        state.enabled[name] = false;
        await this.writeState(state);
    }

    public async update(name: string): Promise<void> {
        const pluginPath = join(this.pluginsDir, name);
        if (!existsSync(pluginPath)) {
            throw new Error(`Plugin not found: ${name}`);
        }
        const gitDir = join(pluginPath, ".git");
        if (!existsSync(gitDir)) {
            return;
        }
        await execFileAsync("git", ["pull", "--ff-only"], { cwd: pluginPath });
    }

    private async readManifest(pluginPath: string): Promise<PluginManifest | undefined> {
        const candidates = [
            join(pluginPath, ".claude-plugin", "plugin.json"),
            join(pluginPath, "plugin.json")
        ];
        for (const file of candidates) {
            if (!existsSync(file)) continue;
            try {
                return JSON.parse(await fs.readFile(file, "utf8")) as PluginManifest;
            } catch {
                return undefined;
            }
        }
        return undefined;
    }

    private async readState(): Promise<PluginStateFile> {
        try {
            const raw = await fs.readFile(this.stateFile, "utf8");
            const parsed = JSON.parse(raw) as PluginStateFile;
            if (parsed.version === 1 && parsed.enabled && typeof parsed.enabled === "object") {
                return parsed;
            }
        } catch {
            // ignore
        }
        return { version: 1, enabled: {} };
    }

    private async writeState(state: PluginStateFile): Promise<void> {
        await fs.mkdir(dirname(this.stateFile), { recursive: true });
        await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2), "utf8");
    }
}

function deriveName(input: string): string {
    return input
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replace(/\.git$/i, "")
        ?.replace(/[^a-zA-Z0-9._-]/g, "-") || "plugin";
}
