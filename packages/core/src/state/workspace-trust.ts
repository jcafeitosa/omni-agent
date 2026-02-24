import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import os from "node:os";

export type TrustLevel = "TRUST_FOLDER" | "TRUST_PARENT" | "DO_NOT_TRUST";

export interface WorkspaceTrustConfig {
    [path: string]: TrustLevel;
}

export interface WorkspaceTrustOptions {
    configPath?: string;
}

export class WorkspaceTrustManager {
    private readonly configPath: string;
    private config: WorkspaceTrustConfig | null = null;

    constructor(options: WorkspaceTrustOptions = {}) {
        this.configPath = resolve(options.configPath || `${os.homedir()}/.omniagent/trustedFolders.json`);
    }

    public getConfigPath(): string {
        return this.configPath;
    }

    public load(): WorkspaceTrustConfig {
        if (this.config) return this.config;
        if (!existsSync(this.configPath)) {
            this.config = {};
            return this.config;
        }
        try {
            const parsed = JSON.parse(readFileSync(this.configPath, "utf8")) as Record<string, unknown>;
            const valid: WorkspaceTrustConfig = {};
            for (const [key, value] of Object.entries(parsed || {})) {
                if (value === "TRUST_FOLDER" || value === "TRUST_PARENT" || value === "DO_NOT_TRUST") {
                    valid[resolve(key)] = value;
                }
            }
            this.config = valid;
        } catch {
            this.config = {};
        }
        return this.config;
    }

    public isPathTrusted(targetPath: string): boolean | undefined {
        const cfg = this.load();
        const target = resolve(targetPath);
        let bestLen = -1;
        let best: TrustLevel | undefined;
        for (const [rulePathRaw, level] of Object.entries(cfg)) {
            const rulePath = resolve(rulePathRaw);
            const effectivePath = level === "TRUST_PARENT" ? dirname(rulePath) : rulePath;
            if (!isSubPath(target, effectivePath)) continue;
            if (rulePath.length > bestLen) {
                bestLen = rulePath.length;
                best = level;
            }
        }
        if (best === "DO_NOT_TRUST") return false;
        if (best === "TRUST_FOLDER" || best === "TRUST_PARENT") return true;
        return undefined;
    }
}

function isSubPath(target: string, root: string): boolean {
    if (target === root) return true;
    const normalizedRoot = root.endsWith("/") ? root : `${root}/`;
    return target.startsWith(normalizedRoot);
}
