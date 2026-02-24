import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AdminControlsSettings } from "./admin-controls.js";

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
    installedVersion?: string;
    installSource?: "path" | "git" | "catalog";
}

interface PluginStateFile {
    version: 1 | 2;
    enabled: Record<string, boolean>;
    installed?: Record<
        string,
        {
            version?: string;
            source?: "path" | "git" | "catalog";
            catalogId?: string;
        }
    >;
}

export interface PluginManagerOptions {
    pluginsDir?: string;
    stateFile?: string;
    catalogFile?: string;
    adminControls?: AdminControlsSettings;
}

export interface PluginCatalogEntry {
    id: string;
    name: string;
    version: string;
    description?: string;
    tags?: string[];
    category?: string;
    author?: string;
    capabilities?: string[];
    connectorCategories?: string[];
    homepage?: string;
    source:
        | { type: "path"; path: string }
        | { type: "git"; repositoryUrl: string; ref?: string };
}

interface PluginCatalogFile {
    version: 1;
    entries: PluginCatalogEntry[];
}

export class PluginManager {
    private readonly pluginsDir: string;
    private readonly stateFile: string;
    private readonly catalogFile: string;
    private adminControls?: AdminControlsSettings;

    constructor(options: PluginManagerOptions = {}) {
        const cwd = process.cwd();
        this.pluginsDir = resolve(options.pluginsDir || join(cwd, ".omniagent", "plugins"));
        this.stateFile = resolve(options.stateFile || join(cwd, ".omniagent", "plugins-state.json"));
        this.catalogFile = resolve(options.catalogFile || join(cwd, ".omniagent", "plugins-catalog.json"));
        this.adminControls = options.adminControls;
    }

    public setAdminControls(adminControls?: AdminControlsSettings): void {
        this.adminControls = adminControls;
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
                manifest: await this.readManifest(path),
                installedVersion: state.installed?.[entry.name]?.version,
                installSource: state.installed?.[entry.name]?.source
            });
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }

    public async installFromPath(sourceDir: string, pluginName?: string): Promise<ManagedPlugin> {
        this.assertExtensionsAllowed();
        const resolved = resolve(sourceDir);
        const manifest = await this.readManifest(resolved);
        const name = pluginName || manifest?.name || deriveName(resolved);
        const target = join(this.pluginsDir, name);
        await fs.mkdir(this.pluginsDir, { recursive: true });
        await fs.rm(target, { recursive: true, force: true });
        await fs.cp(resolved, target, { recursive: true });

        const state = await this.readState();
        state.enabled[name] = true;
        state.installed = state.installed || {};
        state.installed[name] = {
            version: manifest?.version,
            source: "path"
        };
        await this.writeState(state);
        return {
            name,
            path: target,
            enabled: true,
            manifest: await this.readManifest(target),
            installedVersion: manifest?.version,
            installSource: "path"
        };
    }

    public async installFromGit(repositoryUrl: string, pluginName?: string, gitRef?: string): Promise<ManagedPlugin> {
        this.assertExtensionsAllowed();
        await fs.mkdir(this.pluginsDir, { recursive: true });
        const name = pluginName || deriveName(repositoryUrl);
        const target = join(this.pluginsDir, name);
        await fs.rm(target, { recursive: true, force: true });
        const cloneArgs = ["clone"];
        if (gitRef) {
            cloneArgs.push("--branch", gitRef);
        }
        cloneArgs.push(repositoryUrl, target);
        await execFileAsync("git", cloneArgs);
        const installed = await this.installFromPath(target, name);
        const state = await this.readState();
        state.installed = state.installed || {};
        state.installed[name] = {
            version: installed.manifest?.version,
            source: "git"
        };
        await this.writeState(state);
        return { ...installed, installSource: "git" };
    }

    public async listCatalog(): Promise<PluginCatalogEntry[]> {
        const catalog = await this.readCatalog();
        return [...catalog.entries].sort((a, b) => {
            const byName = a.name.localeCompare(b.name);
            if (byName !== 0) return byName;
            return compareVersionsDesc(a.version, b.version);
        });
    }

    public async upsertCatalogEntry(entry: PluginCatalogEntry): Promise<void> {
        this.validateCatalogEntry(entry);
        const catalog = await this.readCatalog();
        const idx = catalog.entries.findIndex((candidate) => candidate.id === entry.id);
        if (idx >= 0) {
            catalog.entries[idx] = entry;
        } else {
            catalog.entries.push(entry);
        }
        await this.writeCatalog(catalog);
    }

    public async removeCatalogEntry(id: string): Promise<void> {
        const catalog = await this.readCatalog();
        catalog.entries = catalog.entries.filter((entry) => entry.id !== id);
        await this.writeCatalog(catalog);
    }

    public async installFromCatalog(name: string, version?: string): Promise<ManagedPlugin> {
        this.assertExtensionsAllowed();
        const catalog = await this.readCatalog();
        const candidates = catalog.entries.filter((entry) => entry.name === name);
        if (candidates.length === 0) {
            throw new Error(`Plugin not found in catalog: ${name}`);
        }
        const selected =
            version
                ? candidates.find((entry) => entry.version === version)
                : [...candidates].sort((a, b) => compareVersionsDesc(a.version, b.version))[0];
        if (!selected) {
            throw new Error(`Plugin version not found in catalog: ${name}@${version}`);
        }

        const installed =
            selected.source.type === "path"
                ? await this.installFromPath(selected.source.path, selected.name)
                : await this.installFromGit(selected.source.repositoryUrl, selected.name, selected.source.ref);

        const state = await this.readState();
        state.installed = state.installed || {};
        state.installed[selected.name] = {
            version: selected.version,
            source: "catalog",
            catalogId: selected.id
        };
        await this.writeState(state);
        return {
            ...installed,
            installedVersion: selected.version,
            installSource: "catalog"
        };
    }

    public async enable(name: string): Promise<void> {
        this.assertExtensionsAllowed();
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
            if (
                (parsed.version === 1 || parsed.version === 2) &&
                parsed.enabled &&
                typeof parsed.enabled === "object"
            ) {
                return parsed;
            }
        } catch {
            // ignore
        }
        return { version: 2, enabled: {}, installed: {} };
    }

    private async writeState(state: PluginStateFile): Promise<void> {
        await fs.mkdir(dirname(this.stateFile), { recursive: true });
        await fs.writeFile(
            this.stateFile,
            JSON.stringify(
                {
                    version: 2,
                    enabled: state.enabled,
                    installed: state.installed || {}
                },
                null,
                2
            ),
            "utf8"
        );
    }

    private async readCatalog(): Promise<PluginCatalogFile> {
        try {
            const raw = await fs.readFile(this.catalogFile, "utf8");
            const parsed = JSON.parse(raw) as PluginCatalogFile;
            if (parsed.version === 1 && Array.isArray(parsed.entries)) {
                return parsed;
            }
        } catch {
            // ignore
        }
        return { version: 1, entries: [] };
    }

    private async writeCatalog(catalog: PluginCatalogFile): Promise<void> {
        await fs.mkdir(dirname(this.catalogFile), { recursive: true });
        await fs.writeFile(this.catalogFile, JSON.stringify(catalog, null, 2), "utf8");
    }

    private assertExtensionsAllowed(): void {
        if (this.adminControls?.extensionsEnabled === false) {
            throw new Error("Extensions are disabled by administrator policy.");
        }
    }

    private validateCatalogEntry(entry: PluginCatalogEntry): void {
        if (!entry.id?.trim()) {
            throw new Error("Catalog entry id is required");
        }
        if (!entry.name?.trim()) {
            throw new Error("Catalog entry name is required");
        }
        if (!entry.version?.trim()) {
            throw new Error("Catalog entry version is required");
        }
        if (entry.capabilities && !Array.isArray(entry.capabilities)) {
            throw new Error("Catalog entry capabilities must be an array");
        }
        if (entry.connectorCategories && !Array.isArray(entry.connectorCategories)) {
            throw new Error("Catalog entry connectorCategories must be an array");
        }
        if (entry.source?.type === "path" && !entry.source.path?.trim()) {
            throw new Error("Catalog entry path source requires source.path");
        }
        if (entry.source?.type === "git" && !entry.source.repositoryUrl?.trim()) {
            throw new Error("Catalog entry git source requires source.repositoryUrl");
        }
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

function compareVersionsDesc(a: string, b: string): number {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    const maxLen = Math.max(pa.length, pb.length);
    for (let i = 0; i < maxLen; i++) {
        const av = pa[i] || 0;
        const bv = pb[i] || 0;
        if (av === bv) continue;
        return bv - av;
    }
    return 0;
}

function parseVersion(version: string): number[] {
    const core = version.split("-")[0] || version;
    return core
        .split(".")
        .map((part) => Number.parseInt(part, 10))
        .map((num) => (Number.isFinite(num) ? num : 0));
}
