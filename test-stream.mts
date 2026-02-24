import { AgentManager } from "./packages/core/src/state/agent-manager.js";
import { HookManager } from "./packages/core/src/state/hook-manager.js";
import { Provider, ToolDefinition } from "./packages/core/src/index.js";
import { join } from "path";

// 1. Mock Provider
let turns = 0;
const mockProvider: Provider = {
    name: "default",
    generateText: async (prompt: string) => {
        turns++
        if (turns === 1) {
            return JSON.stringify({
                text: "I will execute the tools.",
                toolCalls: [
                    { id: "call_1", name: "my_bash_tool", args: { command: "echo MessageStream test" } }
                ]
            });
        }

        return JSON.stringify({
            text: "All tools executed and events streamed. I'm done!",
            toolCalls: []
        })
    }
};

// 2. Mock Tools
const mockTools = new Map<string, ToolDefinition>();
mockTools.set("my_bash_tool", {
    name: "my_bash_tool",
    description: "Run bash",
    parameters: {} as any,
    execute: async (args: any) => `Executed command: ${args.command}`
});

async function main() {
    const manager = new AgentManager({
        providers: new Map([["default", mockProvider]]),
        tools: mockTools,
        defaultModelConfig: { provider: "default", model: "sonnet" }
    });

    manager.loadDirectory(join(process.cwd(), "agents"));

    const def = manager.getDefinition("code-reviewer");
    if (!def) throw new Error("Agent not found");

    import("./packages/core/src/state/session.js").then(({ AgentSession }) => {
        import("./packages/core/src/loops/agent-loop.js").then(({ AgentLoop }) => {
            const session = new AgentSession({ systemPrompt: def.systemPrompt });

            class TestAgentLoop extends AgentLoop {
                protected parseResponse(text: string) {
                    return JSON.parse(text);
                }
            }

            const agentLoop = new TestAgentLoop({
                session,
                provider: mockProvider,
                tools: mockTools,
            });

            console.log("AgentLoop created. Testing MessageStream (for await...)...\n");

            // We use the new async generator `runStream`!
            (async () => {
                for await (const event of agentLoop.runStream("Test streaming")) {
                    switch (event.type) {
                        case "text":
                            console.log(`[STREAMING TEXT]: ${event.text}`);
                            break;
                        case "toolCall":
                            console.log(`[STREAMING TOOL_CALL]: The agent is about to call '${event.tool}' with args: ${JSON.stringify(event.args)}`);
                            break;
                        case "toolResult":
                            console.log(`[STREAMING TOOL_RESULT]: The tool '${event.tool}' returned: ${event.result}`);
                            break;
                        case "finalMessage":
                            console.log(`\n[STREAMING FINAL_MESSAGE]: Agent ended the turn with: ${event.text}`);
                            break;
                    }
                }
            })().catch(err => console.error(err));
        });
    });
}

main();
