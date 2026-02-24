import { readFileSync, readdirSync, lstatSync } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";
import { AgentSession } from "./session.js";
import { AgentLoop } from "../loops/agent-loop.js";
/**
 * AgentManager
 * Dynamically loads and instantiates Agents defined via Markdown files (Claude Code style).
 */
export class AgentManager {
    definitions = new Map();
    providers;
    tools;
    defaultModelConfig;
    constructor(options) {
        this.providers = options.providers;
        this.tools = options.tools;
        this.defaultModelConfig = options.defaultModelConfig;
    }
    /**
     * Parse a single Markdown file containing YAML frontmatter and a System Prompt.
     */
    parseMarkdownDefinition(filePath, content) {
        const yamlMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        let manifest;
        let systemPrompt;
        if (yamlMatch) {
            try {
                manifest = yaml.load(yamlMatch[1]);
                systemPrompt = yamlMatch[2].trim();
            }
            catch (error) {
                throw new Error(`Invalid YAML in Agent Definition ${filePath}: ${error.message}`);
            }
        }
        else {
            // No frontmatter, treat entire file as system prompt
            manifest = { name: "Unnamed Agent", description: "" };
            systemPrompt = content.trim();
        }
        if (!manifest.name) {
            throw new Error(`Agent definition in ${filePath} is missing a 'name' field in frontmatter.`);
        }
        const parsed = { filePath, manifest, systemPrompt };
        this.definitions.set(manifest.name, parsed);
        return parsed;
    }
    /**
     * Scans a directory for .md files and registers them as Agents.
     */
    loadDirectory(dirPath) {
        const files = readdirSync(dirPath);
        for (const file of files) {
            const fullPath = join(dirPath, file);
            if (lstatSync(fullPath).isDirectory()) {
                this.loadDirectory(fullPath); // Recursive
            }
            else if (file.endsWith(".md")) {
                const content = readFileSync(fullPath, "utf-8");
                this.parseMarkdownDefinition(fullPath, content);
            }
        }
    }
    getDefinition(name) {
        return this.definitions.get(name);
    }
    getAllDefinitions() {
        return Array.from(this.definitions.values());
    }
    /**
     * Instantiates the AgentLoop for a specific agent name, weaving the configuration properly.
     */
    createAgent(name) {
        const def = this.definitions.get(name);
        if (!def) {
            throw new Error(`Agent ${name} not found. Ensure it was loaded first.`);
        }
        const session = new AgentSession({ systemPrompt: def.systemPrompt });
        // Resolve Provider
        // Usually, 'model' might dictate provider selection (e.g., 'anthropic:sonnet' or just 'sonnet').
        // We'll simplistic default for now.
        let providerName = this.defaultModelConfig?.provider || "default";
        const provider = this.providers.get(providerName);
        if (!provider) {
            throw new Error(`No provider found mapped to ${providerName}`);
        }
        // Filter Tools list if manifest requests specific tools
        const agentTools = new Map();
        if (def.manifest.tools && Array.isArray(def.manifest.tools)) {
            for (const tName of def.manifest.tools) {
                const t = this.tools.get(tName);
                if (t) {
                    agentTools.set(tName, t);
                }
                else {
                    console.warn(`[AgentManager] Tool ${tName} requested by ${name} was not found in ToolRegistry.`);
                }
            }
        }
        else {
            // Default: Give access to all registered tools if none specified
            for (const [key, val] of this.tools.entries()) {
                agentTools.set(key, val);
            }
        }
        return new AgentLoop({
            session,
            provider,
            tools: agentTools
        });
    }
}
