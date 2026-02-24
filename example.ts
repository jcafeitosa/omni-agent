import { AgentSession } from "@omni-agent/core";
import { AgentLoop } from "@omni-agent/core";
import { AnthropicProvider } from "@omni-agent/provider-anthropic";
import { GeminiProvider } from "@omni-agent/provider-gemini";
import { bashTool } from "@omni-agent/tool-bash";

async function main() {
    const claudeProvider = new AnthropicProvider();
    const geminiProvider = new GeminiProvider();

    const session = new AgentSession({
        systemPrompt: "You are a senior software engineer operating via OmniAgent."
    });

    const loop = new AgentLoop({
        session,
        provider: claudeProvider, // Can easily swap to geminiProvider
        tools: new Map([
            [bashTool().name, bashTool()]
        ])
    });

    console.log(`Agent initialized with ${loop["tools"].size} tools using ${claudeProvider.name}.`);
    console.log("Ready to execute autonomous loop!");
}

main().catch(console.error);
