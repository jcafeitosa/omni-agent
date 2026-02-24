import { ToolDefinition } from "@omni-agent/core";
import { z } from "zod";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getShellConfig, killProcessTree } from "./utils/shell.js";
import { truncateTail, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "./utils/truncate.js";

const DEFAULT_TIMEOUT_SECONDS = 120;
const MAX_COMMAND_LENGTH = 8000;

function getTempFilePath(): string {
    return join(tmpdir(), `omni-bash-${randomBytes(8).toString("hex")}.log`);
}

export interface BashToolOptions {
    cwd?: string;
}

export function bashTool(options?: BashToolOptions): ToolDefinition<{ command: string; timeout?: number }> {
    const cwd = options?.cwd || process.cwd();

    return {
        name: "bash",
        description: `Execute a bash command in the working directory. Output is truncated to last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB to save context. Full output drops to a temp file.`,
        parameters: z.object({
            command: z.string().describe("The bash command to execute"),
            timeout: z.number().optional().describe("Timeout in seconds")
        }),
        execute: async ({ command, timeout }: { command: string; timeout?: number }, context: any) => {
            if (command.length > MAX_COMMAND_LENGTH) {
                throw new Error(`Command exceeds max length of ${MAX_COMMAND_LENGTH} characters`);
            }
            if (command.includes("\0")) {
                throw new Error("Command contains invalid null byte");
            }

            const timeoutSeconds = timeout ?? DEFAULT_TIMEOUT_SECONDS;

            if (context?.sandbox) {
                const res = await context.sandbox.exec(command, { env: process.env as any });
                if (res.exitCode !== 0) {
                    throw new Error(`${res.stdout}\n${res.stderr}\n\nCommand exited with code ${res.exitCode}`);
                }
                return res.stdout || res.stderr || "(no output)";
            }

            return new Promise<string>((resolve, reject) => {
                let tempFilePath: string | undefined;
                let tempFileStream: any | undefined;
                let totalBytes = 0;

                const chunks: Buffer[] = [];
                let chunksBytes = 0;
                const maxChunksBytes = DEFAULT_MAX_BYTES * 2;

                const handleData = (data: Buffer) => {
                    totalBytes += data.length;

                    if (totalBytes > DEFAULT_MAX_BYTES && !tempFilePath) {
                        tempFilePath = getTempFilePath();
                        tempFileStream = createWriteStream(tempFilePath);
                        for (const chunk of chunks) tempFileStream.write(chunk);
                    }

                    if (tempFileStream) tempFileStream.write(data);

                    chunks.push(data);
                    chunksBytes += data.length;

                    while (chunksBytes > maxChunksBytes && chunks.length > 1) {
                        const removed = chunks.shift()!;
                        chunksBytes -= removed.length;
                    }
                };

                const { shell, args } = getShellConfig();

                try {
                    const child = spawn(shell, [...args, command], {
                        cwd,
                        detached: true,
                        env: process.env,
                        stdio: ["ignore", "pipe", "pipe"],
                    });

                    let timedOut = false;
                    let timeoutHandle: NodeJS.Timeout | undefined;
                    if (timeoutSeconds > 0) {
                        timeoutHandle = setTimeout(() => {
                            timedOut = true;
                            if (child.pid) killProcessTree(child.pid);
                        }, timeoutSeconds * 1000);
                    }

                    if (child.stdout) child.stdout.on("data", handleData);
                    if (child.stderr) child.stderr.on("data", handleData);

                    child.on("error", (err) => {
                        if (timeoutHandle) clearTimeout(timeoutHandle);
                        reject(err.message);
                    });

                    child.on("close", (code) => {
                        if (timeoutHandle) clearTimeout(timeoutHandle);
                        if (tempFileStream) tempFileStream.end();

                        const fullBuffer = Buffer.concat(chunks);
                        const fullOutput = fullBuffer.toString("utf-8");

                        const truncation = truncateTail(fullOutput);
                        let outputText = truncation.content || "(no output)";

                        if (truncation.truncated) {
                            const startLine = truncation.totalLines - truncation.outputLines + 1;
                            outputText += `\n\n[Showing lines ${startLine}-${truncation.totalLines}. Full output: ${tempFilePath}]`;
                        }

                        if (timedOut) {
                            reject(`${outputText}\n\nCommand timed out after ${timeoutSeconds} seconds`);
                            return;
                        }

                        if (code !== 0 && code !== null) {
                            reject(`${outputText}\n\nCommand exited with code ${code}`);
                            return;
                        }

                        resolve(outputText);
                    });
                } catch (e: any) {
                    reject(`Failed to spawn shell: ${e.message}`);
                }
            });
        },
    };
}
