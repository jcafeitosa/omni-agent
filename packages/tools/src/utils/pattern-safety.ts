import * as path from "node:path";

export function assertWorkspaceSafePattern(pattern: string): void {
    if (!pattern || !pattern.trim()) {
        throw new Error("Pattern cannot be empty");
    }

    // Prevent absolute filesystem escapes and explicit parent traversal.
    if (path.isAbsolute(pattern) || pattern.includes("..")) {
        throw new Error(`Pattern escapes workspace: ${pattern}`);
    }
}

