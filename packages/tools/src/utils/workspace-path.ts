import * as path from "node:path";

export function resolveWorkspacePath(cwd: string, candidatePath: string): string {
    const fullPath = path.resolve(cwd, candidatePath);
    const relative = path.relative(cwd, fullPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Path escapes workspace root: ${candidatePath}`);
    }
    return fullPath;
}
