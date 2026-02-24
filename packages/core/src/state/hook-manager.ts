import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { HookRuleEngine } from "./hook-rule-engine.js";

export interface HookDefinition {
    type: "command";
    command: string;
    timeout?: number;
}

export interface HooksJson {
    // Lifecycle event to a list of hooks
    hooks: Record<string, { hooks: HookDefinition[] }[]>;
}

export interface HookManagerOptions {
    cwd: string;
    ruleDirectories?: string[];
}

export type HookEventPayload = Record<string, any>;

/**
 * HookManager
 * Parses hooks.json and executes cross-language scripts (Python, Node, Bash, Rust) 
 * passing the Agent state via stdin and reading responses via stdout.
 */
export class HookManager {
    private cwd: string;
    private hooksConfig: HooksJson = { hooks: {} };
    private readonly ruleEngine: HookRuleEngine;

    constructor(options: HookManagerOptions) {
        this.cwd = options.cwd;
        this.ruleEngine = new HookRuleEngine({
            rulesDirectories: options.ruleDirectories || [
                join(options.cwd, ".omniagent", "hooks"),
                join(options.cwd, ".claude")
            ]
        });
    }

    public registerCommandHook(eventName: string, command: string, timeout?: number): void {
        if (!this.hooksConfig.hooks[eventName]) {
            this.hooksConfig.hooks[eventName] = [];
        }
        this.hooksConfig.hooks[eventName].push({
            hooks: [{ type: "command", command, timeout }]
        });
    }

    /**
     * Loads a hooks.json file from a plugin/extension directory.
     */
    loadHooks(hooksFilePath: string): void {
        if (!existsSync(hooksFilePath)) {
            return;
        }

        try {
            const content = readFileSync(hooksFilePath, "utf-8");
            const parsed = JSON.parse(content) as HooksJson;

            // Merge into existing configuration
            if (parsed.hooks) {
                for (const [eventName, hookGroups] of Object.entries(parsed.hooks)) {
                    if (!this.hooksConfig.hooks[eventName]) {
                        this.hooksConfig.hooks[eventName] = [];
                    }
                    this.hooksConfig.hooks[eventName].push(...hookGroups);
                }
            }
        } catch (error: any) {
            throw new Error(`Failed to parse ${hooksFilePath}: ${error.message}`);
        }
    }

    /**
     * Emits a lifecycle event, invoking all registered external shell commands.
     * The `payload` is sent as a JSON string to the process stdin.
     * Returns a merged object of all stdout JSON outputs.
     */
    async emit(eventName: string, payload: HookEventPayload): Promise<HookEventPayload> {
        const ruleContext = buildRuleContext(eventName, payload);
        const rules = this.ruleEngine.loadRules(String(ruleContext.event_name || eventName));
        const ruleResult = this.ruleEngine.evaluate(rules, ruleContext);
        if (ruleResult.blocked) {
            return {
                ...payload,
                block: true,
                reason: ruleResult.blockReason || "Blocked by hook rule."
            };
        }

        let warningMessage = ruleResult.warnings.join("\n\n");
        const hookGroups = this.hooksConfig.hooks[eventName];
        if (!hookGroups || hookGroups.length === 0) {
            return warningMessage
                ? { ...payload, systemMessage: warningMessage }
                : payload; // No hooks registered for this event
        }

        let currentPayload = { ...payload };

        for (const group of hookGroups) {
            for (const hookDef of group.hooks) {
                if (hookDef.type === "command") {
                    try {
                        const modifiedPayload = await this.executeCommandHook(hookDef, currentPayload);
                        if (modifiedPayload) {
                            currentPayload = { ...currentPayload, ...modifiedPayload };
                        }
                    } catch (error: any) {
                        console.error(`[HookManager] Hook execution failed for event '${eventName}':`, error.message);
                        // Depending on strictness, we might re-throw to cancel the loop.
                    }
                }
            }
        }

        if (warningMessage) {
            const existing = currentPayload.systemMessage ? String(currentPayload.systemMessage) : "";
            currentPayload.systemMessage = existing ? `${existing}\n\n${warningMessage}` : warningMessage;
        }

        return currentPayload;
    }

    private executeCommandHook(hookDef: HookDefinition, payload: HookEventPayload): Promise<HookEventPayload | null> {
        return new Promise((resolve, reject) => {
            // Some plugin runtimes inject template variables like ${PLUGIN_ROOT}.
            // A real implementation would resolve variables in hookDef.command here.

            const commandParts = hookDef.command.split(" ");
            const cmd = commandParts[0];
            const args = commandParts.slice(1);

            const child = spawn(cmd, args, {
                cwd: this.cwd,
                shell: true, // required to resolve paths and executables naturally
                stdio: ["pipe", "pipe", "pipe"]
            });

            let stdoutData = "";
            let stderrData = "";

            child.stdout?.on("data", (chunk) => {
                stdoutData += chunk.toString();
            });

            child.stderr?.on("data", (chunk) => {
                stderrData += chunk.toString();
            });

            // Implement timeout
            let timeoutId: NodeJS.Timeout | null = null;
            if (hookDef.timeout) {
                timeoutId = setTimeout(() => {
                    child.kill();
                    reject(new Error(`Hook command timed out after ${hookDef.timeout}s`));
                }, hookDef.timeout * 1000);
            }

            child.on("close", (code) => {
                if (timeoutId) clearTimeout(timeoutId);

                if (code !== 0) {
                    return reject(new Error(`Command exited with ${code}. Stderr: ${stderrData}`));
                }

                if (!stdoutData.trim()) {
                    return resolve(null);
                }

                try {
                    // Try parsing stdout as JSON as the mutations contract
                    const result = JSON.parse(stdoutData) as HookEventPayload;
                    resolve(result);
                } catch (e) {
                    // If stdout isn't JSON, we just ignore modifications
                    resolve(null);
                }
            });

            child.on("error", (err) => {
                if (timeoutId) clearTimeout(timeoutId);
                reject(err);
            });

            // Write payload to stdin and close it
            child.stdin?.write(JSON.stringify(payload));
            child.stdin?.end();
        });
    }
}

function buildRuleContext(eventName: string, payload: HookEventPayload): Record<string, unknown> {
    const toolName = String(payload.tool_name || payload.tool || payload.toolName || "");
    const toolInput = (payload.tool_input || payload.args || payload.toolInput || {}) as Record<string, unknown>;
    return {
        event_name: normalizeHookEvent(eventName),
        tool_name: toolName,
        tool_input: toolInput,
        reason: payload.reason,
        transcript: payload.transcript
    };
}

function normalizeHookEvent(eventName: string): string {
    const normalized = String(eventName || "").trim().toLowerCase();
    if (normalized === "pretooluse") return "pre_tool_use";
    if (normalized === "posttooluse") return "post_tool_use";
    if (normalized === "userpromptsubmit") return "user_prompt_submit";
    return normalized;
}
