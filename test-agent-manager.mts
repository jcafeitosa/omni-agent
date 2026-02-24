import { AgentManager, AgentManifest, ParsedAgentDefinition } from "./packages/core/src/state/agent-manager.js";
import { Provider, ToolDefinition } from "./packages/core/src/index.js";
import { join } from "path";

// 1. Mock Provider
const mockProvider: Provider = {
    name: "default",
    generateText: async (prompt: string) => `Mock LLM Response for prompt length: ${prompt.length}`
};

// 2. Mock Tools
const mockTools = new Map<string, ToolDefinition>();
mockTools.set("my_bash_tool", {
    name: "my_bash_tool",
    description: "Run bash",
    parameters: {} as any, // bypassing zod for mock
    execute: async () => "bash executed"
});

// 3. Initialize AgentManager
const manager = new AgentManager({
    providers: new Map([["default", mockProvider]]),
    tools: mockTools,
    defaultModelConfig: { provider: "default", model: "sonnet" }
});

// 4. Load definitions
console.log("Loading agents from ./agents directory...");
manager.loadDirectory(join(process.cwd(), "agents"));

// 5. Inspect loaded agents
const defs = manager.getAllDefinitions();
console.log(`Loaded ${defs.length} agents.`);
defs.forEach(d => {
    console.log(`- ${d.manifest.name} (model: ${d.manifest.model})`);
});

// 6. Instantiate an AgentLoop
console.log("\nInstantiating 'code-reviewer' agent...");
const agentLoop = manager.createAgent("code-reviewer");
console.log("AgentLoop created successfully.");

// 7. Run Agent
agentLoop.run("Check this code: function test() { return 1; }")
    .then(res => console.log(`\nAgent finished with response:\n${res}`))
    .catch(err => console.error(err));
