import { spawn } from "node:child_process";

export function getShellConfig(): { shell: string; args: string[] } {
    if (process.platform === "win32") {
        return { shell: "cmd.exe", args: ["/c"] };
    }
    return { shell: "bash", args: ["-c"] };
}

export function killProcessTree(pid: number): void {
    if (process.platform === "win32") {
        try {
            spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
        } catch { }
    } else {
        try {
            process.kill(-pid, "SIGKILL");
        } catch {
            try {
                process.kill(pid, "SIGKILL");
            } catch { }
        }
    }
}
