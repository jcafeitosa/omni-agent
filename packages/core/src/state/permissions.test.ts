import test from "node:test";
import assert from "node:assert/strict";
import { PermissionManager } from "./permissions.js";

test("permission manager blocks privileged modes in untrusted workspace", async () => {
    const manager = new PermissionManager("bypassPermissions");
    manager.setWorkspaceTrusted(false);
    const decision = await manager.checkPermission("write_file", {});
    assert.equal(decision.behavior, "deny");
    assert.match(decision.reason || "", /untrusted workspace/i);
});

test("permission manager blocks mcp tools when admin disables mcp", async () => {
    const manager = new PermissionManager("default");
    manager.setAdminControls({
        mcpEnabled: false
    });
    const decision = await manager.checkPermission("mcp_tool", {});
    assert.equal(decision.behavior, "deny");
    assert.match(decision.reason || "", /disabled by administrator/i);
});

test("permission manager blocks bypass mode when strict mode is enabled by admin", async () => {
    const manager = new PermissionManager("bypassPermissions");
    manager.setAdminControls({
        strictModeEnabled: true
    });
    const decision = await manager.checkPermission("bash", { command: "echo ok" });
    assert.equal(decision.behavior, "deny");
    assert.match(decision.reason || "", /bypass mode is disabled/i);
});
