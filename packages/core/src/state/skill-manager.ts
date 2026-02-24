import { existsSync, lstatSync, readFileSync, readdirSync, watch, FSWatcher } from "node:fs";
import { join, resolve } from "node:path";
import * as yaml from "js-yaml";

export interface SkillDefinition {
    name: string;
    description?: string;
    filePath: string;
    content: string;
    referencesDir?: string;
    scriptsDir?: string;
    source: "project" | "plugin" | "user" | "custom";
    agent?: string;
    context?: "inherit" | "fork";
    userInvocable?: boolean;
    allowedTools?: string[];
    disallowedTools?: string[];
    hooks?: Array<{ event: string; command: string; timeout?: number }>;
    compatibility?: string;
    resources?: SkillResourceManifest;
}

export interface SkillManagerOptions {
    directories?: string[];
}

export interface SkillResourceFile {
    path: string;
    bytes?: number;
}

export interface SkillResourceManifest {
    references: SkillResourceFile[];
    scripts: SkillResourceFile[];
    assets: SkillResourceFile[];
}

export class SkillManager {
    private readonly directories: string[];
    private readonly skills = new Map<string, SkillDefinition>();
    private readonly watchers: FSWatcher[] = [];

    constructor(options: SkillManagerOptions = {}) {
        this.directories = dedupe(
            (options.directories || defaultSkillDirectories())
                .map((d) => resolve(d))
                .filter((d) => existsSync(d))
        );
    }

    public loadAll(): SkillDefinition[] {
        this.skills.clear();
        for (const dir of this.directories) {
            this.scanDirectory(dir);
        }
        return this.listSkills();
    }

    public listSkills(): SkillDefinition[] {
        return Array.from(this.skills.values());
    }

    public startWatch(): void {
        this.stopWatch();
        for (const dir of this.directories) {
            try {
                const w = watch(dir, { recursive: true }, (_eventType, filename) => {
                    if (!filename) return;
                    if (!filename.toString().endsWith("SKILL.md")) return;
                    this.loadAll();
                });
                this.watchers.push(w);
            } catch {
                // ignore watcher failures for unsupported filesystems
            }
        }
    }

    public stopWatch(): void {
        while (this.watchers.length > 0) {
            const w = this.watchers.pop();
            try {
                w?.close();
            } catch {
                // ignore
            }
        }
    }

    public getSkill(name: string): SkillDefinition | undefined {
        return this.skills.get(name);
    }

    public resolveSkills(names: string[]): SkillDefinition[] {
        if (this.skills.size === 0) {
            this.loadAll();
        }
        return names
            .map((name) => this.skills.get(name))
            .filter((skill): skill is SkillDefinition => Boolean(skill));
    }

    private scanDirectory(root: string): void {
        const entries = safeReadDir(root);
        for (const entry of entries) {
            const full = join(root, entry);
            if (!safeIsDirectory(full)) continue;

            const skillFile = join(full, "SKILL.md");
            if (existsSync(skillFile)) {
                const parsed = parseSkillFile(skillFile);
                if (parsed) {
                    const uniqueName = this.toUniqueSkillName(parsed.name, skillFile);
                    this.skills.set(uniqueName, {
                        ...parsed,
                        name: uniqueName,
                        source: detectSource(skillFile),
                        referencesDir: existsSync(join(full, "references")) ? join(full, "references") : undefined,
                        scriptsDir: existsSync(join(full, "scripts")) ? join(full, "scripts") : undefined,
                        resources: buildSkillResourceManifest(full)
                    });
                }
                continue;
            }

            this.scanDirectory(full);
        }
    }

    private toUniqueSkillName(baseName: string, filePath: string): string {
        if (!this.skills.has(baseName)) {
            return baseName;
        }
        const existing = this.skills.get(baseName);
        if (existing?.filePath === filePath) {
            return baseName;
        }
        const scope = inferScope(filePath);
        let candidate = `${baseName}@${scope}`;
        let index = 2;
        while (this.skills.has(candidate)) {
            candidate = `${baseName}@${scope}-${index}`;
            index++;
        }
        return candidate;
    }
}

function parseSkillFile(filePath: string): Omit<SkillDefinition, "source"> | null {
    try {
        const raw = readFileSync(filePath, "utf8");
        const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        let name = "";
        let description = "";
        let content = raw;
        let meta: Partial<SkillDefinition> = {};
        if (match) {
            const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
            name = String(frontmatter?.name || "").trim();
            description = String(frontmatter?.description || "").trim();
            content = match[2].trim();
            meta = {
                agent: frontmatter?.agent ? String(frontmatter.agent) : undefined,
                context: frontmatter?.context === "fork" ? "fork" : "inherit",
                userInvocable: frontmatter?.["user-invocable"] === false ? false : true,
                allowedTools: normalizeStringArray(frontmatter?.["allowed-tools"]),
                disallowedTools: normalizeStringArray(frontmatter?.["disallowed-tools"]),
                hooks: normalizeHooks(frontmatter?.hooks),
                compatibility: normalizeCompatibility(frontmatter?.compatibility)
            };
        }
        if (!name) {
            name = deriveNameFromPath(filePath);
        }
        return {
            name,
            description: description || undefined,
            filePath,
            content,
            ...meta
        };
    } catch {
        return null;
    }
}

function normalizeCompatibility(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === "string") {
        const normalized = value.trim();
        return normalized || undefined;
    }
    if (Array.isArray(value)) {
        const parts = value.map((v) => String(v).trim()).filter(Boolean);
        return parts.length ? parts.join(", ") : undefined;
    }
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(", ");
        return entries || undefined;
    }
    return undefined;
}

function buildSkillResourceManifest(skillDir: string): SkillResourceManifest {
    return {
        references: scanResourceDir(join(skillDir, "references"), skillDir),
        scripts: scanResourceDir(join(skillDir, "scripts"), skillDir),
        assets: scanResourceDir(join(skillDir, "assets"), skillDir)
    };
}

function scanResourceDir(dirPath: string, skillDir: string): SkillResourceFile[] {
    if (!existsSync(dirPath)) return [];
    const out: SkillResourceFile[] = [];
    const queue = [dirPath];
    while (queue.length > 0) {
        const current = queue.shift()!;
        const entries = safeReadDir(current);
        for (const entry of entries) {
            const full = join(current, entry);
            if (safeIsDirectory(full)) {
                queue.push(full);
                continue;
            }
            try {
                const stat = lstatSync(full);
                if (!stat.isFile()) continue;
                out.push({
                    path: full.replace(`${skillDir}/`, ""),
                    bytes: stat.size
                });
            } catch {
                // skip inaccessible entries
            }
        }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
}

function defaultSkillDirectories(): string[] {
    const cwd = process.cwd();
    const parent = resolve(cwd, "..");
    const siblingPluginRoots = safeReadDir(parent)
        .map((entry) => join(parent, entry, "plugins"))
        .filter((dir) => existsSync(dir));
    const siblingSkillRoots = safeReadDir(parent)
        .map((entry) => join(parent, entry, "skills"))
        .filter((dir) => existsSync(dir));
    const dirs = [
        join(cwd, ".claude", "skills"),
        join(cwd, "skills"),
        join(cwd, "plugins"),
        ...siblingSkillRoots,
        ...siblingPluginRoots
    ];
    return dirs;
}

function deriveNameFromPath(filePath: string): string {
    const parts = filePath.split("/");
    const idx = parts.lastIndexOf("SKILL.md");
    if (idx > 0) return parts[idx - 1];
    return filePath;
}

function detectSource(filePath: string): SkillDefinition["source"] {
    if (filePath.includes("/plugins/")) return "plugin";
    if (filePath.includes("/.claude/skills/")) return "project";
    if (filePath.includes("/.codex/skills/")) return "user";
    return "custom";
}

function dedupe(items: string[]): string[] {
    return Array.from(new Set(items));
}

function safeReadDir(dir: string): string[] {
    try {
        return readdirSync(dir);
    } catch {
        return [];
    }
}

function safeIsDirectory(path: string): boolean {
    try {
        return lstatSync(path).isDirectory();
    } catch {
        return false;
    }
}

function normalizeStringArray(value: unknown): string[] | undefined {
    if (!value) return undefined;
    const normalized = Array.isArray(value)
        ? value.map((v) => String(v).trim())
        : typeof value === "string"
            ? value
                  .split(",")
                  .map((v) => v.trim().replace(/^["']|["']$/g, ""))
            : [];
    const list = normalized.filter(Boolean);
    if (list.length === 0) return undefined;
    return Array.from(new Set(list));
}

function inferScope(filePath: string): string {
    const match = filePath.match(/\/plugins\/([^/]+)\//);
    if (match?.[1]) return match[1];
    const parts = filePath.split("/");
    return parts.slice(-2, -1)[0] || "scope";
}

function normalizeHooks(value: unknown): Array<{ event: string; command: string; timeout?: number }> | undefined {
    if (!Array.isArray(value)) return undefined;
    const hooks = value
        .map((h) => {
            const entry = h as Record<string, unknown>;
            const event = String(entry?.event || "").trim();
            const command = String(entry?.command || "").trim();
            const timeout = typeof entry?.timeout === "number" ? entry.timeout : undefined;
            if (!event || !command) return null;
            return timeout === undefined ? { event, command } : { event, command, timeout };
        })
        .filter(Boolean) as Array<{ event: string; command: string; timeout?: number }>;
    return hooks.length > 0 ? hooks : undefined;
}
