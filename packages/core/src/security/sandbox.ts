/**
 * Sandbox Interface
 * Defines how OmniAgent isolates tool execution.
 */

export interface SandboxExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export interface Sandbox {
    /**
     * Executes a command inside the sandbox.
     */
    exec(command: string, options?: { cwd?: string; env?: Record<string, string> }): Promise<SandboxExecutionResult>;

    /**
     * Reads a file from the sandbox.
     */
    readFile(path: string): Promise<string>;

    /**
     * Writes a file to the sandbox.
     */
    writeFile(path: string, content: string): Promise<void>;

    /**
     * Deletes the sandbox resources.
     */
    destroy(): Promise<void>;
}

export interface SandboxProvider {
    name: string;
    createSandbox(options?: { workspaceDir?: string }): Promise<Sandbox>;
}
