import { z } from "zod";
import * as fs from "node:fs/promises";
import { ToolDefinition, generateUnifiedDiff } from "@omni-agent/core";
import { resolveWorkspacePath } from "./utils/workspace-path.js";

export const editTool = (cwd: string = process.cwd()): ToolDefinition => ({
    name: "edit",
    description: "Edits an existing file by replacing an exact string match. Use cautiously and provide exact existing strings.",
    parameters: z.object({
        file_path: z.string().describe("The path to the file to modify."),
        old_string: z.string().describe("The exact text to replace. It must match the file content exactly."),
        new_string: z.string().describe("The new text to replace the old text with."),
        allow_multiple: z.boolean().optional().describe("If true, replaces all occurrences. If false, fails if there is more than 1 occurrence.")
    }),
    execute: async ({ file_path, old_string, new_string, allow_multiple = false }, context: any) => {
        try {
            let currentContent = "";
            if (context?.sandbox) {
                currentContent = await context.sandbox.readFile(file_path);
            } else {
                const fullPath = resolveWorkspacePath(cwd, file_path);
                currentContent = await fs.readFile(fullPath, "utf-8");
            }

            const normalizedCode = currentContent;
            const normalizedSearch = old_string.replace(/\r\n/g, "\n");
            const normalizedReplace = new_string.replace(/\r\n/g, "\n");

            if (normalizedSearch === "") {
                return `File unmodified, old_string is empty.`;
            }

            const exactOccurrences = normalizedCode.split(normalizedSearch).length - 1;

            if (exactOccurrences === 0) {
                return `Error: Could not find the exact old_string in ${file_path}. Make sure whitespace and indentation match exactly.`;
            }

            if (!allow_multiple && exactOccurrences > 1) {
                return `Error: Expected 1 occurrence but found ${exactOccurrences} matches in ${file_path}. Ensure it is unique, or set allow_multiple to true.`;
            }

            const newContent = normalizedCode.split(normalizedSearch).join(normalizedReplace);

            if (context?.sandbox) {
                await context.sandbox.writeFile(file_path, newContent);
            } else {
                const fullPath = resolveWorkspacePath(cwd, file_path);
                await fs.writeFile(fullPath, newContent, "utf-8");
            }

            const { diff } = generateUnifiedDiff(file_path, currentContent, newContent);
            return JSON.stringify({
                message: `Successfully replaced ${exactOccurrences} occurrence(s) in ${file_path}.`,
                diff
            });
        } catch (error: any) {
            return `Error editing file ${file_path}: ${error.message}`;
        }
    }
});
