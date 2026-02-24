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
}

export interface SkillManagerOptions {
    directories?: string[];
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
                    this.skills.set(parsed.name, {
                        ...parsed,
                        source: detectSource(skillFile),
                        referencesDir: existsSync(join(full, "references")) ? join(full, "references") : undefined,
                        scriptsDir: existsSync(join(full, "scripts")) ? join(full, "scripts") : undefined
                    });
                }
                continue;
            }

            this.scanDirectory(full);
        }
    }
}

function parseSkillFile(filePath: string): Omit<SkillDefinition, "source"> | null {
    try {
        const raw = readFileSync(filePath, "utf8");
        const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        let name = "";
        let description = "";
        let content = raw;
        if (match) {
            const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
            name = String(frontmatter?.name || "").trim();
            description = String(frontmatter?.description || "").trim();
            content = match[2].trim();
        }
        if (!name) {
            name = deriveNameFromPath(filePath);
        }
        return {
            name,
            description: description || undefined,
            filePath,
            content
        };
    } catch {
        return null;
    }
}

function defaultSkillDirectories(): string[] {
    const cwd = process.cwd();
    const parent = resolve(cwd, "..");
    const dirs = [
        join(cwd, ".claude", "skills"),
        join(cwd, "skills"),
        join(cwd, "plugins"),
        join(parent, "skills"),
        join(parent, "knowledge-work-plugins"),
        join(parent, "claude-code", "plugins")
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
