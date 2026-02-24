import { z } from "zod";
import * as fs from "node:fs/promises";
import { ToolDefinition } from "@omni-agent/core";
import { resolveWorkspacePath } from "./utils/workspace-path.js";

const DEFAULT_MEMORY_FILE = "GEMINI.md";

export const memoryTool = (cwd: string = process.cwd(), memoryFile: string = DEFAULT_MEMORY_FILE): ToolDefinition => ({
    name: "memory",
    description: "Saves a fact or memory to the project's memory file (usually GEMINI.md). Extends the agent's long-term memory.",
    parameters: z.object({
        fact: z.string().describe("The fact, context, or memory to save.")
    }),
    execute: async ({ fact }) => {
        try {
            const memoryPath = resolveWorkspacePath(cwd, memoryFile);
            let content = "";

            try {
                content = await fs.readFile(memoryPath, "utf-8");
            } catch (err: any) {
                if (err.code !== "ENOENT") throw err;
            }

            const HEADER = "## Agent Added Memories";
            const sanitizedFact = fact.replace(/[\r\n]/g, " ").trim();
            const newMemoryItem = `- ${sanitizedFact}`;

            let newContent = "";
            if (!content.includes(HEADER)) {
                const separator = content && !content.endsWith("\n\n") ? "\n\n" : "";
                newContent = content + `${separator}${HEADER}\n${newMemoryItem}\n`;
            } else {
                const headerIndex = content.indexOf(HEADER) + HEADER.length;
                const endOfSectionIndex = content.indexOf("\n## ", headerIndex);

                const beforeSection = content.substring(0, headerIndex).trimEnd();
                const sectionContent = endOfSectionIndex === -1
                    ? content.substring(headerIndex).trimEnd()
                    : content.substring(headerIndex, endOfSectionIndex).trimEnd();
                const afterSection = endOfSectionIndex === -1
                    ? ""
                    : content.substring(endOfSectionIndex);

                newContent = `${beforeSection}\n${sectionContent}\n${newMemoryItem}\n${afterSection}`;
            }

            await fs.writeFile(memoryPath, newContent.trimStart(), "utf-8");
            return `Successfully saved memory: "${sanitizedFact}" to ${memoryFile}`;
        } catch (error: any) {
            return `Error saving memory: ${error.message}`;
        }
    }
});
