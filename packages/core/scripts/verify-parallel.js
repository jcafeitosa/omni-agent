import { AgentLoop, AgentSession, parallelDelegateTool } from "../dist/index.js";
import { z } from "zod";

async function verifyParallel() {
    console.log("🚀 Verifying Parallel Agent Orchestration...");

    const session = new AgentSession();
    // Use a mock provider for testing or a real one if configured
    const mockProvider = {
        name: "mock",
        generateText: async (messages, tools) => {
            // Check if it's the main loop calling parallel_delegate
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.text && lastMessage.text.includes("Run a security audit")) {
                return {
                    text: "I will delegate this to experts.",
                    toolCalls: [{
                        id: "call_1",
                        name: "parallel_delegate",
                        args: {
                            agents: [
                                { role: "Security Expert", task: "Check for vulnerabilities" },
                                { role: "Documentation Expert", task: "Review README" }
                            ]
                        }
                    }],
                    usage: { inputTokens: 50, outputTokens: 50 }
                };
            }

            await new Promise(resolve => setTimeout(resolve, 500));
            return {
                text: "Success from mock specialist",
                toolCalls: [],
                usage: { inputTokens: 10, outputTokens: 10, thinkingTokens: 0 }
            };
        },
        embedText: async () => new Array(1536).fill(0),
        embedBatch: async (texts) => texts.map(() => new Array(1536).fill(0))
    };

    const tools = new Map();
    tools.set("parallel_delegate", parallelDelegateTool(mockProvider, tools, session));

    const loop = new AgentLoop({
        session,
        provider: mockProvider,
        tools
    });

    console.log("Running parallel delegation...");
    const stream = loop.runStream("Run a security audit and documentation review in parallel.");

    for await (const event of stream) {
        if (event.type === 'status') {
            console.log(`[STATUS] ${event.message}`);
        }
        if (event.type === 'result') {
            console.log(`[RESULT] ${event.result}`);
        }
    }

    console.log("✅ Verification complete.");
}

verifyParallel().catch(console.error);
