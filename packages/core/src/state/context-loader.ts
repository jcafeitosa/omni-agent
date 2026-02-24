import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";

/**
 * ContextLoader
 * Responsible for finding and loading CLAUDE.md files to inject project constitution.
 */
export class ContextLoader {
    public static readonly DEFAULT_BOOTSTRAP_FILES = [
        "AGENTS.md",
        "AGENT.md",
        "SOUL.md",
        "USER.md",
        "IDENTITY.md"
    ] as const;

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

    /**
     * Finds nearest file in current directory or parents.
     */
    findNearestFile(cwd: string, fileName: string): string | null {
        let current = cwd;
        while (current !== dirname(current)) {
            const path = join(current, fileName);
            if (existsSync(path)) {
                return path;
            }
            current = dirname(current);
        }
        return null;
    }

    /**
     * Loads bootstrap persona/project files (AGENT/IDENTITY/SOUL/USER) if present.
     */
    loadBootstrapContext(cwd: string, fileNames: string[] = [...ContextLoader.DEFAULT_BOOTSTRAP_FILES]): string {
        const sections: string[] = [];
        for (const fileName of fileNames) {
            const path = this.findNearestFile(cwd, fileName);
            if (!path) continue;
            try {
                const content = readFileSync(path, "utf-8").trim();
                if (!content) continue;
                sections.push(`## ${fileName}\n\n${content}`);
            } catch (e) {
                console.error(`[ContextLoader] Failed to read ${fileName}: ${e}`);
            }
        }
        return sections.join("\n\n");
    }
}
