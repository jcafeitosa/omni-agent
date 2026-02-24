import { readFileSync, readdirSync, lstatSync } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";
import { AgentSession } from "./session.js";
import { AgentLoop } from "../loops/agent-loop.js";
import { Provider, ToolDefinition } from "../index.js";
import { PolicyEngine, PolicyRule } from "./policy-engine.js";
import { PermissionManager, PermissionMode } from "./permissions.js";
import { SkillManager } from "./skill-manager.js";
import { AgentOrchestrator } from "./agent-orchestrator.js";

export interface AgentDefinition {
    description: string;
    prompt: string;
    tools?: string[];
    disallowedTools?: string[];
    model?: string;
    maxTurns?: number;
    maxCostUsd?: number;
    policies?: PolicyRule[];
    skills?: string[];
    background?: boolean;
    isolation?: "none" | "worktree";
    permissionMode?: PermissionMode;
    allowedAgents?: string[];
}

export interface AgentManifest extends Partial<AgentDefinition> {
    name: string;
}

export interface ParsedAgentDefinition {
    filePath: string;
    manifest: AgentManifest;
    systemPrompt: string;
}

export interface AgentManagerOptions {
    providers: Map<string, Provider>;
    tools: Map<string, ToolDefinition>;
    defaultModelConfig?: { provider: string; model: string };
    skillDirectories?: string[];
    autoLoadSkills?: boolean;
}

/**
 * AgentManager
 * Dynamically loads and instantiates Agents defined via Markdown files (Claude Code style).
 */
export class AgentManager {
    private definitions: Map<string, ParsedAgentDefinition> = new Map();
    private providers: Map<string, Provider>;
    private tools: Map<string, ToolDefinition>;
    private defaultModelConfig?: { provider: string; model: string };
    private readonly skillManager: SkillManager;
    private readonly autoLoadSkills: boolean;
    private orchestrator?: AgentOrchestrator;

    constructor(options: AgentManagerOptions) {
        this.providers = options.providers;
        this.tools = options.tools;
        this.defaultModelConfig = options.defaultModelConfig;
        this.skillManager = new SkillManager({ directories: options.skillDirectories });
        this.autoLoadSkills = options.autoLoadSkills !== false;
        if (this.autoLoadSkills) {
            this.skillManager.loadAll();
        }
    }

    /**
     * Parse a single Markdown file containing YAML frontmatter and a System Prompt.
     */
    parseMarkdownDefinition(filePath: string, content: string): ParsedAgentDefinition {
        const yamlMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

        let manifest: AgentManifest;
        let systemPrompt: string;

        if (yamlMatch) {
            try {
                manifest = yaml.load(yamlMatch[1]) as AgentManifest;
                systemPrompt = yamlMatch[2].trim();
            } catch (error: any) {
                throw new Error(`Invalid YAML in Agent Definition ${filePath}: ${error.message}`);
            }
        } else {
            // No frontmatter, treat entire file as system prompt
            manifest = { name: "Unnamed Agent", description: "" };
            systemPrompt = content.trim();
        }

        if (!manifest.name) {
            throw new Error(`Agent definition in ${filePath} is missing a 'name' field in frontmatter.`);
        }

        const parsed: ParsedAgentDefinition = { filePath, manifest, systemPrompt };
        this.definitions.set(manifest.name, parsed);
        return parsed;
    }

    /**
     * Scans a directory for .md files and registers them as Agents.
     */
    loadDirectory(dirPath: string): void {
        const files = readdirSync(dirPath);
        for (const file of files) {
            const fullPath = join(dirPath, file);
            if (lstatSync(fullPath).isDirectory()) {
                this.loadDirectory(fullPath); // Recursive
            } else if (file.endsWith(".md")) {
                const content = readFileSync(fullPath, "utf-8");
                this.parseMarkdownDefinition(fullPath, content);
            }
        }
    }

    getDefinition(name: string): ParsedAgentDefinition | undefined {
        return this.definitions.get(name);
    }

    getAllDefinitions(): ParsedAgentDefinition[] {
        return Array.from(this.definitions.values());
    }

    getAgentNames(): string[] {
        return Array.from(this.definitions.keys()).sort();
    }

    /**
     * Instantiates the AgentLoop for a specific agent name, weaving the configuration properly.
     * Supports inheritance and tool filtering.
     */
    createAgent(nameOrDef: string | AgentDefinition, parentTools?: Map<string, ToolDefinition>): AgentLoop {
        let manifest: AgentManifest;
        let systemPrompt: string;
        let toolsToUse: string[] | undefined;
        let disallowed: string[] | undefined;
        let model: string | undefined;
        let maxTurns: number | undefined;
        let maxCostUsd: number | undefined;
        let policies: PolicyRule[] | undefined;
        let skills: string[] | undefined;
        let permissionMode: PermissionMode | undefined;

        if (typeof nameOrDef === "string") {
            const def = this.definitions.get(nameOrDef);
            if (!def) {
                throw new Error(`Agent ${nameOrDef} not found. Ensure it was loaded first.`);
            }
            manifest = def.manifest;
            systemPrompt = def.systemPrompt;
            toolsToUse = manifest.tools;
            disallowed = manifest.disallowedTools;
            model = manifest.model;
            maxTurns = manifest.maxTurns;
            maxCostUsd = manifest.maxCostUsd;
            policies = manifest.policies;
            skills = manifest.skills;
            permissionMode = manifest.permissionMode;
        } else {
            manifest = { name: "Subagent", ...nameOrDef };
            systemPrompt = nameOrDef.prompt;
            toolsToUse = nameOrDef.tools;
            disallowed = nameOrDef.disallowedTools;
            model = nameOrDef.model;
            maxTurns = nameOrDef.maxTurns;
            maxCostUsd = nameOrDef.maxCostUsd;
            policies = nameOrDef.policies;
            skills = nameOrDef.skills;
            permissionMode = nameOrDef.permissionMode;
        }

        const skillContext = this.resolveSkillsContext(skills || []);
        const finalPrompt = skillContext ? `${systemPrompt}\n\n${skillContext}` : systemPrompt;
        const session = new AgentSession({ systemPrompt: finalPrompt });

        // Resolve Provider
        let providerName = model || this.defaultModelConfig?.provider || "default";
        const provider = this.providers.get(providerName) || this.providers.get("default");
        if (!provider) {
            throw new Error(`No provider found for agent. Ensure a default provider is registered.`);
        }

        // Filter Tools list
        const agentTools = new Map<string, ToolDefinition>();
        const sourceTools = parentTools || this.tools;

        if (toolsToUse && Array.isArray(toolsToUse)) {
            for (const tName of toolsToUse) {
                const t = sourceTools.get(tName);
                if (t) agentTools.set(tName, t);
            }
        } else {
            // Inherit all tools from source
            for (const [key, val] of sourceTools.entries()) {
                agentTools.set(key, val);
            }
        }

        // Apply disallow list
        if (disallowed && Array.isArray(disallowed)) {
            for (const tName of disallowed) {
                agentTools.delete(tName);
            }
        }

        const policyEngine = policies?.length ? new PolicyEngine(policies) : undefined;
        const permissionManager = new PermissionManager(permissionMode || "default", undefined, policyEngine);

        return new AgentLoop({
            session,
            provider,
            tools: agentTools,
            maxTurns,
            maxCostUsd,
            agentName: manifest.name,
            policyEngine,
            permissionManager,
            agentManager: this
        });
    }

    public getSkillManager(): SkillManager {
        return this.skillManager;
    }

    public listAvailableSkills(): Array<{ name: string; description?: string; source: string }> {
        if (this.autoLoadSkills) {
            this.skillManager.loadAll();
        }
        return this.skillManager.listSkills().map((skill) => ({
            name: skill.name,
            description: skill.description,
            source: skill.source
        }));
    }

    public createOrchestrator(): AgentOrchestrator {
        if (!this.orchestrator) {
            this.orchestrator = new AgentOrchestrator(this);
        }
        return this.orchestrator;
    }

    private resolveSkillsContext(skillNames: string[]): string {
        if (skillNames.length === 0) return "";
        const resolved = this.skillManager.resolveSkills(skillNames);
        if (resolved.length === 0) return "";
        return [
            "Loaded Skills Context:",
            ...resolved.map((skill) => `- [${skill.name}] ${skill.description || ""}\n${skill.content}`.trim())
        ].join("\n\n");
    }
}
