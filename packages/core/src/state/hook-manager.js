import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
/**
 * HookManager
 * Parses hooks.json and executes cross-language scripts (Python, Node, Bash, Rust)
 * passing the Agent state via stdin and reading responses via stdout.
 */
export class HookManager {
    cwd;
    hooksConfig = { hooks: {} };
    constructor(options) {
        this.cwd = options.cwd;
    }
    /**
     * Loads a hooks.json file from a plugin/extension directory.
     */
    loadHooks(hooksFilePath) {
        if (!existsSync(hooksFilePath)) {
            return;
        }
        try {
            const content = readFileSync(hooksFilePath, "utf-8");
            const parsed = JSON.parse(content);
            // Merge into existing configuration
            if (parsed.hooks) {
                for (const [eventName, hookGroups] of Object.entries(parsed.hooks)) {
                    if (!this.hooksConfig.hooks[eventName]) {
                        this.hooksConfig.hooks[eventName] = [];
                    }
                    this.hooksConfig.hooks[eventName].push(...hookGroups);
                }
            }
        }
        catch (error) {
            throw new Error(`Failed to parse ${hooksFilePath}: ${error.message}`);
        }
    }
    /**
     * Emits a lifecycle event, invoking all registered external shell commands.
     * The `payload` is sent as a JSON string to the process stdin.
     * Returns a merged object of all stdout JSON outputs.
     */
    async emit(eventName, payload) {
        const hookGroups = this.hooksConfig.hooks[eventName];
        if (!hookGroups || hookGroups.length === 0) {
            return payload; // No hooks registered for this event
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
                    }
                    catch (error) {
                        console.error(`[HookManager] Hook execution failed for event '${eventName}':`, error.message);
                        // Depending on strictness, we might re-throw to cancel the loop.
                    }
                }
            }
        }
        return currentPayload;
    }
    executeCommandHook(hookDef, payload) {
        return new Promise((resolve, reject) => {
            // Claude Code injects variables like ${CLAUDE_PLUGIN_ROOT}
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
            let timeoutId = null;
            if (hookDef.timeout) {
                timeoutId = setTimeout(() => {
                    child.kill();
                    reject(new Error(`Hook command timed out after ${hookDef.timeout}s`));
                }, hookDef.timeout * 1000);
            }
            child.on("close", (code) => {
                if (timeoutId)
                    clearTimeout(timeoutId);
                if (code !== 0) {
                    return reject(new Error(`Command exited with ${code}. Stderr: ${stderrData}`));
                }
                if (!stdoutData.trim()) {
                    return resolve(null);
                }
                try {
                    // Try parsing stdout as JSON as the mutations contract
                    const result = JSON.parse(stdoutData);
                    resolve(result);
                }
                catch (e) {
                    // If stdout isn't JSON, we just ignore modifications
                    resolve(null);
                }
            });
            child.on("error", (err) => {
                if (timeoutId)
                    clearTimeout(timeoutId);
                reject(err);
            });
            // Write payload to stdin and close it
            child.stdin?.write(JSON.stringify(payload));
            child.stdin?.end();
        });
    }
}
