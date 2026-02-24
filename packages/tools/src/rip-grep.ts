import { z } from "zod";
import { execFile } from "node:child_process";
import * as util from "node:util";
import { ToolDefinition } from "@omni-agent/core";
import { resolveWorkspacePath } from "./utils/workspace-path.js";
import { assertWorkspaceSafePattern } from "./utils/pattern-safety.js";

const execFileAsync = util.promisify(execFile);

export const ripGrepTool = (cwd: string = process.cwd()): ToolDefinition => ({
    name: "rip_grep",
    description: "Searches for a regular expression pattern in files using ripgrep (`rg`). Extremely fast and respects gitignore.",
    parameters: z.object({
        pattern: z.string().describe("The regular expression pattern to search for."),
        dir_path: z.string().optional().describe("The directory to search in, relative to workspace. Defaults to '.'"),
        include: z.string().optional().describe("Glob pattern to include (e.g. '*.ts')"),
        case_sensitive: z.boolean().optional().describe("If true, searches case-sensitively."),
        fixed_strings: z.boolean().optional().describe("If true, treats pattern as a literal string.")
    }),
    execute: async ({ pattern, dir_path = ".", include, case_sensitive, fixed_strings }) => {
        try {
            const targetDir = resolveWorkspacePath(cwd, dir_path);
            if (include) assertWorkspaceSafePattern(include);
            const args: string[] = ["--line-number", "--heading"];

            if (!case_sensitive) args.push("--ignore-case");
            if (fixed_strings) args.push("--fixed-strings");
            if (include) args.push("--glob", include);

            args.push(pattern, targetDir);

            const { stdout, stderr } = await execFileAsync("rg", args, { cwd });

            if (stderr) return `Errors occurred: ${stderr}\n\nResults:\n${stdout}`;
            return stdout || "No matches found.";
        } catch (error: any) {
            // ripgrep exits with 1 if no matches are found, which causes exec to throw.
            if (error.code === 1 && !error.stderr) {
                return "No matches found.";
            }
            return `Error running ripgrep: ${error.message}\nMake sure 'rg' is installed on your system.`;
        }
    }
});
