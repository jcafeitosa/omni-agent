import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";

/**
 * ContextLoader
 * Responsible for finding and loading CLAUDE.md files to inject project constitution.
 */
export class ContextLoader {
    /**
     * Finds CLAUDE.md in current directory or parents.
     */
    findConstitution(cwd: string): string | null {
        let current = cwd;
        while (current !== dirname(current)) {
            const path = join(current, "CLAUDE.md");
            if (existsSync(path)) {
                return path;
            }
            current = dirname(current);
        }
        return null;
    }

    /**
     * Loads the constitution text.
     */
    loadConstitution(cwd: string): string {
        const path = this.findConstitution(cwd);
        if (path) {
            try {
                return readFileSync(path, "utf-8");
            } catch (e) {
                console.error(`[ContextLoader] Failed to read CLAUDE.md: ${e}`);
            }
        }
        return "";
    }
}
