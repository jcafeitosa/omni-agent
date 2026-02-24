import { LocalSandboxProvider } from "../dist/index.js";
import * as path from "node:path";

async function verifySecurity() {
    console.log("🛡️ Verifying Local Sandbox Security...");

    const provider = new LocalSandboxProvider();
    const sandbox = await provider.createSandbox({
        workspaceDir: path.resolve(process.cwd(), "temp-sandbox")
    });

    try {
        console.log("Testing path traversal (read)...");
        await sandbox.readFile("../../../etc/passwd");
        console.error("❌ FAIL: Sandbox allowed reading outside workspace!");
    } catch (e) {
        console.log("✅ PASS: Blocked illegal read:", e.message);
    }

    try {
        console.log("Testing path traversal (write)...");
        await sandbox.writeFile("../evil.txt", "pwned");
        console.error("❌ FAIL: Sandbox allowed writing outside workspace!");
    } catch (e) {
        console.log("✅ PASS: Blocked illegal write:", e.message);
    }

    console.log("🛡️ Security Verification Complete.");
}

verifySecurity().catch(console.error);
