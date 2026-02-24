import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";
import ignore from "ignore";
import { z } from "zod";
import { ToolDefinition, generateUnifiedDiff } from "@omni-agent/core";
import { resolveWorkspacePath } from "./utils/workspace-path.js";
import { assertWorkspaceSafePattern } from "./utils/pattern-safety.js";

export const readFileTool = (cwd: string = process.cwd()): ToolDefinition => ({
    name: "read_file",
    description: "Reads the contents of a single file.",
    parameters: z.object({
        file_path: z.string().describe("The path to the file to read, relative to the workspace root."),
    }),
    execute: async ({ file_path }, context: any) => {
        try {
            if (context?.sandbox) {
                return await context.sandbox.readFile(file_path);
            }
            const fullPath = resolveWorkspacePath(cwd, file_path);
            const content = await fs.readFile(fullPath, "utf-8");
            return content;
        } catch (error: any) {
            return `Error reading file ${file_path}: ${error.message}`;
        }
    }
});

export const readManyFilesTool = (cwd: string = process.cwd()): ToolDefinition => ({
    name: "read_many_files",
    description: "Finds and reads multiple text files from the local filesystem using glob patterns. The contents are concatenated with a separator.",
    parameters: z.object({
        include: z.array(z.string()).describe("Glob patterns for files to include. Example: ['*.ts', 'src/**/*.md']"),
        exclude: z.array(z.string()).optional().describe("Glob patterns to exclude from results."),
        useDefaultExcludes: z.boolean().optional().describe("Whether to apply default exclusions like node_modules, .git, etc.")
    }),
    execute: async ({ include, exclude = [], useDefaultExcludes = true }) => {
        for (const pattern of include) assertWorkspaceSafePattern(pattern);
        for (const pattern of exclude) assertWorkspaceSafePattern(pattern);

        const effectiveExcludes = useDefaultExcludes
            ? [...exclude, "node_modules/**", ".git/**", "dist/**"]
            : exclude;

        try {
            const files = await glob(include, {
                cwd,
                ignore: effectiveExcludes,
                nodir: true,
                absolute: true
            });

            if (files.length === 0) {
                return "No files matching the criteria were found.";
            }

            const ig = ignore().add(effectiveExcludes);
            const filteredFiles = files.filter(f => !ig.ignores(path.relative(cwd, f)));

            let result = "";
            for (const file of filteredFiles) {
                try {
                    const content = await fs.readFile(file, "utf-8");
                    result += `--- ${path.relative(cwd, file)} ---\n\n${content}\n\n`;
                } catch (e: any) {
                    result += `--- ${path.relative(cwd, file)} ---\n[Error reading file: ${e.message}]\n\n`;
                }
            }
            return result.trim();
        } catch (error: any) {
            return `Error searching for files: ${error.message}`;
        }
    }
});

export const globTool = (cwd: string = process.cwd()): ToolDefinition => ({
    name: "glob",
    description: "Search for files within the workspace using glob patterns. Returns a list of matching file paths.",
    parameters: z.object({
        pattern: z.string().describe("The glob pattern to search for. Example: 'src/**/*.ts'"),
        exclude: z.array(z.string()).optional().describe("Optional glob patterns to exclude.")
    }),
    execute: async ({ pattern, exclude = [] }) => {
        assertWorkspaceSafePattern(pattern);
        for (const x of exclude) assertWorkspaceSafePattern(x);

        try {
            const files = await glob(pattern, {
                cwd,
                ignore: [...exclude, "node_modules/**", ".git/**"],
                nodir: true
            });
            return files.length > 0 ? files.join("\n") : "No matching files found.";
        } catch (error: any) {
            return `Error running glob: ${error.message}`;
        }
    }
});

export const writeFileTool = (cwd: string = process.cwd()): ToolDefinition => ({
    name: "write_file",
    description: "Creates or overwrites a file with the specified content.",
    parameters: z.object({
        file_path: z.string().describe("The path to the file to create or overwrite."),
        content: z.string().describe("The full content to write to the file.")
    }),
    execute: async ({ file_path, content }, context: any) => {
        try {
            if (context?.sandbox) {
                let oldContent = "";
                try {
                    oldContent = await context.sandbox.readFile(file_path);
                } catch (e) { }
                await context.sandbox.writeFile(file_path, content);
                const { diff } = generateUnifiedDiff(file_path, oldContent, content);
                return JSON.stringify({
                    message: `Successfully wrote to ${file_path} (sandboxed)`,
                    diff
                });
            }

            const fullPath = resolveWorkspacePath(cwd, file_path);
            let oldContent = "";
            try {
                oldContent = await fs.readFile(fullPath, "utf-8");
            } catch (e) { }

            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content, "utf-8");

            const { diff } = generateUnifiedDiff(file_path, oldContent, content);
            return JSON.stringify({
                message: `Successfully wrote to ${file_path}`,
                diff
            });
        } catch (error: any) {
            return `Error writing to file ${file_path}: ${error.message}`;
        }
    }
});
