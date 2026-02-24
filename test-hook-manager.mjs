import { AgentManager } from "./packages/core/src/state/agent-manager.js";
import { HookManager } from "./packages/core/src/state/hook-manager.js";
import { join } from "path";
// 1. Mock Provider that always outputs a tool call to 'my_bash_tool'
let turns = 0;
const mockProvider = {
    name: "default",
    generateText: async (prompt) => {
        turns++;
        if (turns === 1) {
            // We simulate that the LLM decided to call my_bash_tool
            return JSON.stringify({
                text: "I will execute your command.",
                toolCalls: [
                    {
                        id: "call_1",
                        name: "my_bash_tool",
                        args: { command: "echo Hello World" } // Will be intercepted by Python (Pre) and Node (Post)
                    },
                    {
                        id: "call_2",
                        name: "my_bash_tool",
                        args: { command: "rm -rf /" } // Will be blocked by Python
                    }
                ]
            });
        }
        return JSON.stringify({
            text: "All tools executed. I'm done!",
            toolCalls: []
        });
    }
};
// 2. Mock Tools
const mockTools = new Map();
mockTools.set("my_bash_tool", {
    name: "my_bash_tool",
    description: "Run bash",
    parameters: {},
    execute: async (args) => `Executed command: ${args.command}`
});
async function main() {
    // 3. Initialize HookManager
    const hookManager = new HookManager({ cwd: process.cwd() });
    // Load hooks.json mapping
    hookManager.loadHooks(join(process.cwd(), "hooks.json"));
    console.log("Hooks loaded.");
    // 4. Initialize AgentManager
    const manager = new AgentManager({
        providers: new Map([["default", mockProvider]]),
        tools: mockTools,
        defaultModelConfig: { provider: "default", model: "sonnet" }
    });
    manager.loadDirectory(join(process.cwd(), "agents"));
    console.log("\nInstantiating 'code-reviewer' agent...");
    const def = manager.getDefinition("code-reviewer");
    if (!def)
        throw new Error("Agent not found");
    // We manually recreate the loop to inject the hookManager for the test
    import("./packages/core/src/state/session.js").then(({ AgentSession }) => {
        import("./packages/core/src/loops/agent-loop.js").then(({ AgentLoop }) => {
            const session = new AgentSession({ systemPrompt: def.systemPrompt });
            // Re-override parseResponse for the test to inject toolCalls directly 
            // since the actual implementation has a dummy parser.
            class TestAgentLoop extends AgentLoop {
                parseResponse(text) {
                    return JSON.parse(text); // Simple parse for test
                }
            }
            const agentLoop = new TestAgentLoop({
                session,
                provider: mockProvider,
                tools: mockTools,
                hookManager // Inject Hook Manager
            });
            console.log("AgentLoop created successfully. Running...\n");
            agentLoop.run("Do some bash stuff")
                .then(() => {
                console.log("\nSession Messages History:");
                session.getMessages().forEach(m => {
                    console.log(`[${m.role}] ${m.text}`);
                });
            })
                .catch(err => console.error(err));
        });
    });
}
main();
