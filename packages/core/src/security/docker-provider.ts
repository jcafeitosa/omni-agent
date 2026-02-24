import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Sandbox, SandboxExecutionResult, SandboxProvider } from "./sandbox.js";

const execAsync = promisify(exec);

/**
 * DockerSandbox
 * Isolates execution within a Docker container.
 * This is a prototype that requires Docker to be installed.
 */
export class DockerSandbox implements Sandbox {
    private containerId: string | null = null;

    constructor(private imageName: string = "node:20-slim") { }

    async start(): Promise<void> {
        try {
            const { stdout } = await execAsync(`docker run -d -it ${this.imageName} /bin/bash`);
            this.containerId = stdout.trim();
        } catch (error: any) {
            throw new Error(`Failed to start Docker container: ${error.message}`);
        }
    }

    async exec(command: string, options: { env?: Record<string, string> } = {}): Promise<SandboxExecutionResult> {
        if (!this.containerId) throw new Error("Sandbox not started");

        const envArgs = options.env
            ? Object.entries(options.env).map(([k, v]) => `-e ${k}=${v}`).join(" ")
            : "";

        try {
            const { stdout, stderr } = await execAsync(`docker exec ${envArgs} ${this.containerId} sh -c "${command.replace(/"/g, '\\"')}"`);
            return { stdout, stderr, exitCode: 0 };
        } catch (error: any) {
            return {
                stdout: error.stdout || "",
                stderr: error.stderr || error.message,
                exitCode: error.code || 1
            };
        }
    }

    async readFile(filePath: string): Promise<string> {
        if (!this.containerId) throw new Error("Sandbox not started");
        const { stdout } = await execAsync(`docker exec ${this.containerId} cat ${filePath}`);
        return stdout;
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        if (!this.containerId) throw new Error("Sandbox not started");
        // Using a temporary file and docker cp or echo
        await execAsync(`docker exec ${this.containerId} sh -c "mkdir -p \\$(dirname ${filePath}) && echo '${content.replace(/'/g, "'\\''")}' > ${filePath}"`);
    }

    async destroy(): Promise<void> {
        if (this.containerId) {
            await execAsync(`docker rm -f ${this.containerId}`);
            this.containerId = null;
        }
    }
}

export class DockerSandboxProvider implements SandboxProvider {
    name = "docker";
    async createSandbox(): Promise<Sandbox> {
        const sandbox = new DockerSandbox();
        await sandbox.start();
        return sandbox;
    }
}
