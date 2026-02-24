import { z } from "zod";
import { execFileSync } from "child_process";
import { ToolDefinition } from "@omni-agent/core";

/**
 * git_status Tool
 */
export const gitStatusTool: ToolDefinition = {
    name: "git_status",
    description: "Get the current git status (staged and unstaged changes)",
    parameters: z.object({}),
    execute: async () => {
        try {
            return execFileSync("git", ["status", "--short"], { encoding: "utf-8" });
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }
};

/**
 * git_diff Tool
 */
export const gitDiffTool: ToolDefinition = {
    name: "git_diff",
    description: "Get the diff of staged or unstaged changes",
    parameters: z.object({
        staged: z.boolean().optional().describe("Whether to show staged changes")
    }),
    execute: async ({ staged }) => {
        try {
            const args = staged ? ["diff", "--staged"] : ["diff"];
            return execFileSync("git", args, { encoding: "utf-8" });
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }
};

/**
 * git_commit Tool
 */
export const gitCommitTool: ToolDefinition = {
    name: "git_commit",
    description: "Create a git commit with a specific message",
    parameters: z.object({
        message: z.string().describe("The commit message"),
        addAll: z.boolean().optional().describe("Whether to add all changes before committing")
    }),
    execute: async ({ message, addAll }) => {
        try {
            if (addAll) {
                execFileSync("git", ["add", "."], { encoding: "utf-8" });
            }
            execFileSync("git", ["commit", "-m", message], { encoding: "utf-8" });
            return "Successfully committed changes.";
        } catch (e: any) {
            return `Error committing: ${e.message}`;
        }
    }
};
