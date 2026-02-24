import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface PluginScaffoldOptions {
    rootDir: string;
    name: string;
    description?: string;
    version?: string;
    author?: string;
    capabilities?: string[];
    connectorCategories?: string[];
}

export interface PluginValidationIssue {
    path: string;
    message: string;
}

export interface PluginValidationResult {
    ok: boolean;
    issues: PluginValidationIssue[];
}

export async function createPluginScaffold(options: PluginScaffoldOptions): Promise<string> {
    const rootDir = resolve(options.rootDir);
    const pluginDir = join(rootDir, options.name);
    const capabilities = normalizeArray(options.capabilities || ["task.plan", "task.execute"]);
    const connectorCategories = normalizeArray(options.connectorCategories || ["~~knowledge", "~~chat"]);

    await mkdir(join(pluginDir, ".claude-plugin"), { recursive: true });
    await mkdir(join(pluginDir, "commands"), { recursive: true });
    await mkdir(join(pluginDir, "skills", "task-management"), { recursive: true });
    await mkdir(join(pluginDir, "skills", "memory-management"), { recursive: true });
    await mkdir(join(pluginDir, "agents"), { recursive: true });

    const pluginManifest = {
        name: options.name,
        version: options.version || "0.1.0",
        description: options.description || "Omni Agent role plugin",
        author: options.author || "unknown",
        capabilities,
        connectorCategories
    };

    const mcpConfig = {
        connectors: connectorCategories.map((category, idx) => ({
            id: `${options.name}-connector-${idx + 1}`,
            category,
            endpoint: "https://example.invalid/mcp"
        }))
    };

    await writeFile(join(pluginDir, ".claude-plugin", "plugin.json"), JSON.stringify(pluginManifest, null, 2), "utf8");
    await writeFile(join(pluginDir, ".mcp.json"), JSON.stringify(mcpConfig, null, 2), "utf8");
    await writeFile(
        join(pluginDir, "README.md"),
        `# ${options.name}\n\n${pluginManifest.description}\n\n## Capabilities\n${capabilities.map((c) => `- ${c}`).join("\n")}\n`,
        "utf8"
    );

    await writeFile(
        join(pluginDir, "commands", "start.md"),
        `# /start\n\n1. Carregar contexto principal\n2. Ler TASKS.md se existir\n3. Priorizar tarefas bloqueadas\n`,
        "utf8"
    );

    await writeFile(
        join(pluginDir, "skills", "task-management", "SKILL.md"),
        `---\nname: task-management\ndescription: Gerencia backlog e execução em TASKS.md\n---\n\nUse TASKS.md como fonte de tarefas e mantenha status atualizado.\n`,
        "utf8"
    );

    await writeFile(
        join(pluginDir, "skills", "memory-management", "SKILL.md"),
        `---\nname: memory-management\ndescription: Gerencia memoria hot/deep\n---\n\nPromova fatos ativos para memoria hot e arquive contexto estavel na memoria deep.\n`,
        "utf8"
    );

    await writeFile(
        join(pluginDir, "agents", "coordinator.md"),
        `---\nname: coordinator\ndescription: Agente coordenador\nmodel: auto\n---\n\nCoordene tarefas e skills do plugin ${options.name}.\n`,
        "utf8"
    );

    return pluginDir;
}

export async function validatePluginStructure(pluginDir: string): Promise<PluginValidationResult> {
    const resolved = resolve(pluginDir);
    const issues: PluginValidationIssue[] = [];

    const requiredFiles = [
        ".claude-plugin/plugin.json",
        ".mcp.json",
        "commands/start.md",
        "skills/task-management/SKILL.md",
        "skills/memory-management/SKILL.md",
        "agents/coordinator.md"
    ];

    for (const relative of requiredFiles) {
        const full = join(resolved, relative);
        if (!existsSync(full)) {
            issues.push({ path: relative, message: "required file is missing" });
        }
    }

    const manifestFile = join(resolved, ".claude-plugin", "plugin.json");
    if (existsSync(manifestFile)) {
        try {
            const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as Record<string, unknown>;
            if (!String(manifest.name || "").trim()) {
                issues.push({ path: ".claude-plugin/plugin.json", message: "manifest.name is required" });
            }
            if (!String(manifest.version || "").trim()) {
                issues.push({ path: ".claude-plugin/plugin.json", message: "manifest.version is required" });
            }
            if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
                issues.push({ path: ".claude-plugin/plugin.json", message: "manifest.capabilities must contain at least one capability" });
            }
        } catch {
            issues.push({ path: ".claude-plugin/plugin.json", message: "manifest must be valid JSON" });
        }
    }

    return {
        ok: issues.length === 0,
        issues
    };
}

function normalizeArray(values: string[]): string[] {
    return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)));
}
