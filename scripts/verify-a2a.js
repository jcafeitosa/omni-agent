import { AgentSession, AgentLoop } from "../packages/core/dist/index.js";

class MockProvider {
    constructor(name) {
        this.name = name;
        this.callCount = 0;
    }

    async generateText(messages, tools) {
        this.callCount++;
        const lastMessage = messages[messages.length - 1].text || "";

        // Mock logic for lead agent
        if (lastMessage.includes(" Use um sub-agente")) {
            return {
                text: "Entendido. Vou delegar essa tarefa para um sub-agente especialista.",
                toolCalls: [{
                    name: "delegate",
                    args: {
                        role: "File Analyst",
                        task: "Leia o package.json e resuma as dependências.",
                        instructions: "Foque nas dependências de produção."
                    },
                    id: "call_1"
                }]
            };
        }

        // Mock logic for sub-agent (recursive call)
        if (lastMessage.includes("Leia o package.json")) {
            return {
                text: "Eu analisei o package.json. O projeto usa React, Ink e Zod.",
                toolCalls: []
            };
        }

        // Final summary logic
        if (lastMessage.includes("Sub-Agent (File Analyst) Result")) {
            return {
                text: "O sub-agente terminou a análise. O projeto é um CLI avançado baseado em React. Resumo salvo em A2A_SUMMARY.md.",
                toolCalls: []
            };
        }

        return { text: "Comando não reconhecido pelo mock.", toolCalls: [] };
    }
}

async function verifyA2A() {
    console.log("--- Starting Mocked A2A Verification ---");

    const provider = new MockProvider("MockGemini");
    const session = new AgentSession();
    const tools = new Map();

    const loop = new AgentLoop({
        session,
        provider,
        tools,
        maxTurns: 10
    });

    const prompt = " Use um sub-agente (delegate) para ler o arquivo 'package.json'.";

    console.log(`Prompt: ${prompt}`);

    try {
        const result = await loop.run(prompt);
        console.log("\n--- Final Result ---");
        console.log(result);
        if (provider.callCount >= 2) {
            console.log("\n[SUCCESS] Hierarchical loop executed correctly.");
        } else {
            console.log("\n[FAILURE] Hierarchical loop did not execute as expected.");
        }
        console.log("\n--- Verification Complete ---");
    } catch (error) {
        console.error("Verification Failed:", error);
    }
}

verifyA2A();
