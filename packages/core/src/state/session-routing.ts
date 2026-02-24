export type DMScope = "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";

export interface RoutePeer {
    kind: "direct" | "group" | "channel";
    id?: string;
}

export interface SessionKeyParams {
    agentId: string;
    channel?: string;
    accountId?: string;
    peer?: RoutePeer;
    dmScope?: DMScope;
    identityLinks?: Record<string, string[]>;
}

export function buildAgentMainSessionKey(agentId: string): string {
    return `agent:${normalizeAgentId(agentId)}:main`;
}

export function buildAgentPeerSessionKey(params: SessionKeyParams): string {
    const agentId = normalizeAgentId(params.agentId);
    const peer = params.peer || { kind: "direct" as const };
    const peerKind = peer.kind || "direct";

    if (peerKind === "direct") {
        const dmScope = params.dmScope || "main";
        let peerId = String(peer.id || "").trim();
        if (dmScope !== "main" && peerId) {
            const linked = resolveLinkedPeerId(params.identityLinks || {}, params.channel || "", peerId);
            if (linked) peerId = linked;
        }
        peerId = peerId.toLowerCase();
        if (dmScope === "per-account-channel-peer" && peerId) {
            return `agent:${agentId}:${normalizeChannel(params.channel)}:${normalizeAccountId(params.accountId)}:direct:${peerId}`;
        }
        if (dmScope === "per-channel-peer" && peerId) {
            return `agent:${agentId}:${normalizeChannel(params.channel)}:direct:${peerId}`;
        }
        if (dmScope === "per-peer" && peerId) {
            return `agent:${agentId}:direct:${peerId}`;
        }
        return buildAgentMainSessionKey(agentId);
    }

    const peerId = String(peer.id || "unknown").trim().toLowerCase() || "unknown";
    return `agent:${agentId}:${normalizeChannel(params.channel)}:${peerKind}:${peerId}`;
}

function normalizeAgentId(agentId: string): string {
    const normalized = String(agentId || "").trim();
    return normalized || "default";
}

function normalizeAccountId(accountId?: string): string {
    const normalized = String(accountId || "").trim().toLowerCase();
    return normalized || "default";
}

function normalizeChannel(channel?: string): string {
    const normalized = String(channel || "").trim().toLowerCase();
    return normalized || "unknown";
}

function resolveLinkedPeerId(identityLinks: Record<string, string[]>, channel: string, peerId: string): string {
    if (!peerId) return "";
    const normalized = peerId.trim().toLowerCase();
    const scoped = `${normalizeChannel(channel)}:${normalized}`;
    for (const [canonical, ids] of Object.entries(identityLinks || {})) {
        const canonicalKey = canonical.trim();
        if (!canonicalKey) continue;
        for (const id of ids || []) {
            const candidate = String(id || "").trim().toLowerCase();
            if (candidate && (candidate === normalized || candidate === scoped)) {
                return canonicalKey;
            }
        }
    }
    return "";
}

