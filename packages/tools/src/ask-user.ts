import { z } from "zod";
import * as readline from "node:readline";
import { ToolDefinition } from "@omni-agent/core";

export const askUserTool = (): ToolDefinition => ({
    name: "ask_user",
    description: "Asks the user a question and waits for their input. Use this to request clarifications, approvals, or missing information.",
    parameters: z.object({
        question: z.string().describe("The question to ask the user.")
    }),
    execute: async ({ question }) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            console.log("\n[Agent is asking you a question]");
            rl.question(`\x1b[36m${question}\x1b[0m\n> `, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }
});
