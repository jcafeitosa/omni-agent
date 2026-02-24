import { readFileSync, readdirSync, lstatSync } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";
import { AgentSession } from "./session.js";
import { AgentLoop } from "../loops/agent-loop.js";
import { Provider, ToolDefinition } from "../index.js";

export interface AgentDefinition {
    description: string;
    prompt: string;
    tools?: string[];
    disallowedTools?: string[];
    model?: string;
    maxTurns?: number;
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

    constructor(options: AgentManagerOptions) {
        this.providers = options.providers;
        this.tools = options.tools;
        this.defaultModelConfig = options.defaultModelConfig;
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
        } else {
            manifest = { name: "Subagent", ...nameOrDef };
            systemPrompt = nameOrDef.prompt;
            toolsToUse = nameOrDef.tools;
            disallowed = nameOrDef.disallowedTools;
            model = nameOrDef.model;
            maxTurns = nameOrDef.maxTurns;
        }

        const session = new AgentSession({ systemPrompt });

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

        return new AgentLoop({
            session,
            provider,
            tools: agentTools,
            maxTurns
        });
    }
}
