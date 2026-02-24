import { randomUUID } from "node:crypto";

export type CommunicationRole = "owner" | "admin" | "team_lead" | "agent" | "observer";
export type ChannelType = "general" | "team" | "department" | "project" | "private" | "dm" | "incident";

export interface AgentIdentity {
    id: string;
    displayName: string;
    role: CommunicationRole;
    team?: string;
    department?: string;
    tags?: string[];
}

export interface ChannelMember {
    agentId: string;
    role: CommunicationRole;
    joinedAt: number;
}

export interface CommunicationChannel {
    id: string;
    workspaceId: string;
    name: string;
    type: ChannelType;
    createdBy: string;
    team?: string;
    department?: string;
    isPrivate: boolean;
    members: Map<string, ChannelMember>;
    createdAt: number;
    updatedAt: number;
}

export interface ChannelMessage {
    id: string;
    workspaceId: string;
    channelId: string;
    senderId: string;
    text: string;
    createdAt: number;
    updatedAt: number;
    threadRootId?: string;
    mentions: string[];
    reactions: Record<string, string[]>;
    metadata?: Record<string, unknown>;
}

export interface CreateChannelInput {
    workspaceId: string;
    name: string;
    type: ChannelType;
    createdBy: string;
    team?: string;
    department?: string;
    isPrivate?: boolean;
    id?: string;
    members?: ChannelMember[];
    createdAt?: number;
    updatedAt?: number;
}

export interface PostMessageInput {
    workspaceId: string;
    channelId: string;
    senderId: string;
    text: string;
    threadRootId?: string;
    metadata?: Record<string, unknown>;
    id?: string;
    createdAt?: number;
    updatedAt?: number;
    mentions?: string[];
    reactions?: Record<string, string[]>;
    channelUpdatedAt?: number;
}

export interface UpdateChannelInput {
    workspaceId: string;
    channelId: string;
    requestedBy: string;
    name?: string;
    isPrivate?: boolean;
    team?: string;
    department?: string;
}

export interface DeliveryPlan {
    channelId: string;
    messageId: string;
    recipients: string[];
    mentionedAgents: string[];
    mentionedGroups: string[];
}

export interface SearchMessagesOptions {
    channelId?: string;
    threadRootId?: string;
    senderId?: string;
    limit?: number;
}

export type AgentCommunicationDomainEvent =
    | { type: "workspace_ready"; workspaceId: string; at: number }
    | { type: "agent_registered"; workspaceId: string; identity: AgentIdentity; at: number }
    | { type: "channel_created"; workspaceId: string; channel: CommunicationChannel; at: number }
    | { type: "channel_updated"; workspaceId: string; channel: CommunicationChannel; at: number }
    | { type: "channel_deleted"; workspaceId: string; channelId: string; requestedBy: string; at: number }
    | { type: "channel_joined"; workspaceId: string; channelId: string; member: ChannelMember; at: number }
    | {
          type: "message_posted";
          workspaceId: string;
          channelId: string;
          message: ChannelMessage;
          delivery: DeliveryPlan;
          at: number;
      }
    | {
          type: "reaction_added";
          workspaceId: string;
          channelId: string;
          messageId: string;
          agentId: string;
          emoji: string;
          at: number;
      };

export interface JoinChannelResult {
    member: ChannelMember;
    channelUpdatedAt: number;
}

interface WorkspaceState {
    agents: Map<string, AgentIdentity>;
    channels: Map<string, CommunicationChannel>;
    messagesByChannel: Map<string, ChannelMessage[]>;
}

export interface AgentCommunicationHubState {
    version: 1;
    lastEventSeq?: number;
    workspaces: Array<{
        workspaceId: string;
        agents: AgentIdentity[];
        channels: Array<{
            id: string;
            workspaceId: string;
            name: string;
            type: ChannelType;
            createdBy: string;
            team?: string;
            department?: string;
            isPrivate: boolean;
            members: ChannelMember[];
            createdAt: number;
            updatedAt: number;
        }>;
        messages: ChannelMessage[];
    }>;
}

export class AgentCommunicationHub {
    private readonly workspaces = new Map<string, WorkspaceState>();
    private readonly listeners = new Set<(event: AgentCommunicationDomainEvent) => void>();

    public ensureWorkspace(workspaceId: string): void {
        if (this.workspaces.has(workspaceId)) return;
        this.workspaces.set(workspaceId, {
            agents: new Map(),
            channels: new Map(),
            messagesByChannel: new Map()
        });
        this.emit({ type: "workspace_ready", workspaceId, at: Date.now() });
    }

    public registerAgent(workspaceId: string, identity: AgentIdentity): void {
        const ws = this.getWorkspace(workspaceId);
        ws.agents.set(identity.id, { ...identity });
        this.emit({ type: "agent_registered", workspaceId, identity: { ...identity }, at: Date.now() });
    }

    public createChannel(input: CreateChannelInput): CommunicationChannel {
        const ws = this.getWorkspace(input.workspaceId);
        this.assertAgentExists(ws, input.createdBy);
        const now = Date.now();
        const channelId = input.id || `${input.type}:${slug(input.name)}:${randomUUID().slice(0, 8)}`;
        const channel: CommunicationChannel = {
            id: channelId,
            workspaceId: input.workspaceId,
            name: input.name.trim(),
            type: input.type,
            createdBy: input.createdBy,
            team: input.team,
            department: input.department,
            isPrivate: input.isPrivate ?? input.type === "private",
            members: new Map(),
            createdAt: input.createdAt ?? now,
            updatedAt: input.updatedAt ?? now
        };
        if (input.members?.length) {
            for (const member of input.members) {
                channel.members.set(member.agentId, { ...member });
            }
        } else {
            const creator = ws.agents.get(input.createdBy)!;
            channel.members.set(input.createdBy, {
                agentId: input.createdBy,
                role: creator.role,
                joinedAt: now
            });
        }
        ws.channels.set(channel.id, channel);
        ws.messagesByChannel.set(channel.id, []);
        this.emit({ type: "channel_created", workspaceId: input.workspaceId, channel, at: Date.now() });
        return channel;
    }

    public updateChannel(input: UpdateChannelInput): CommunicationChannel {
        const ws = this.getWorkspace(input.workspaceId);
        const actor = this.getAgent(ws, input.requestedBy);
        const channel = this.getChannel(ws, input.channelId);
        if (!this.canManageChannel(channel, actor)) {
            throw new Error(`Agent ${input.requestedBy} is not allowed to update channel ${input.channelId}`);
        }
        if (input.name !== undefined) {
            channel.name = input.name.trim() || channel.name;
        }
        if (input.isPrivate !== undefined) channel.isPrivate = Boolean(input.isPrivate);
        if (input.team !== undefined) channel.team = input.team;
        if (input.department !== undefined) channel.department = input.department;
        channel.updatedAt = Date.now();
        this.emit({ type: "channel_updated", workspaceId: input.workspaceId, channel, at: Date.now() });
        return channel;
    }

    public deleteChannel(workspaceId: string, channelId: string, requestedBy: string): void {
        const ws = this.getWorkspace(workspaceId);
        const actor = this.getAgent(ws, requestedBy);
        const channel = this.getChannel(ws, channelId);
        if (!this.canManageChannel(channel, actor)) {
            throw new Error(`Agent ${requestedBy} is not allowed to delete channel ${channelId}`);
        }
        ws.channels.delete(channelId);
        ws.messagesByChannel.delete(channelId);
        this.emit({ type: "channel_deleted", workspaceId, channelId, requestedBy, at: Date.now() });
    }

    public joinChannel(
        workspaceId: string,
        channelId: string,
        agentId: string,
        options: { role?: CommunicationRole; joinedAt?: number; updatedAt?: number } = {}
    ): JoinChannelResult {
        const ws = this.getWorkspace(workspaceId);
        const channel = this.getChannel(ws, channelId);
        const agent = this.getAgent(ws, agentId);
        if (!this.canAccessChannel(channel, agent, ws)) {
            throw new Error(`Agent ${agentId} is not allowed to join channel ${channelId}`);
        }
        const now = Date.now();
        const member: ChannelMember = {
            agentId,
            role: options.role ?? agent.role,
            joinedAt: options.joinedAt ?? now
        };
        const channelUpdatedAt = options.updatedAt ?? now;
        channel.members.set(agentId, member);
        channel.updatedAt = channelUpdatedAt;
        this.emit({ type: "channel_joined", workspaceId, channelId, member, at: Date.now() });
        return { member, channelUpdatedAt };
    }

    public addChannelMember(
        workspaceId: string,
        channelId: string,
        agentId: string,
        requestedBy: string,
        options: { role?: CommunicationRole; joinedAt?: number; updatedAt?: number } = {}
    ): JoinChannelResult {
        const ws = this.getWorkspace(workspaceId);
        const actor = this.getAgent(ws, requestedBy);
        const channel = this.getChannel(ws, channelId);
        if (!this.canManageChannel(channel, actor)) {
            throw new Error(`Agent ${requestedBy} is not allowed to manage channel ${channelId}`);
        }
        this.assertAgentExists(ws, agentId);
        const now = Date.now();
        const agent = this.getAgent(ws, agentId);
        const member: ChannelMember = {
            agentId,
            role: options.role ?? agent.role,
            joinedAt: options.joinedAt ?? now
        };
        const channelUpdatedAt = options.updatedAt ?? now;
        channel.members.set(agentId, member);
        channel.updatedAt = channelUpdatedAt;
        this.emit({ type: "channel_joined", workspaceId, channelId, member, at: Date.now() });
        return { member, channelUpdatedAt };
    }

    public postMessage(input: PostMessageInput): { message: ChannelMessage; delivery: DeliveryPlan; channelUpdatedAt: number } {
        const ws = this.getWorkspace(input.workspaceId);
        const channel = this.getChannel(ws, input.channelId);
        const sender = this.getAgent(ws, input.senderId);
        if (!this.canPost(channel, sender, ws)) {
            throw new Error(`Agent ${input.senderId} is not allowed to post in channel ${channel.id}`);
        }
        if (!channel.members.has(input.senderId)) {
            channel.members.set(input.senderId, {
                agentId: input.senderId,
                role: sender.role,
                joinedAt: Date.now()
            });
        }
        const mentions = normalizeMentions(input.text, input.mentions);
        const now = Date.now();
        const message: ChannelMessage = {
            id: input.id || randomUUID(),
            workspaceId: input.workspaceId,
            channelId: channel.id,
            senderId: input.senderId,
            text: input.text,
            createdAt: input.createdAt ?? now,
            updatedAt: input.updatedAt ?? now,
            threadRootId: input.threadRootId,
            mentions: mentions.tokens,
            reactions: { ...(input.reactions || {}) },
            metadata: input.metadata
        };
        const messages = ws.messagesByChannel.get(channel.id) || [];
        messages.push(message);
        ws.messagesByChannel.set(channel.id, messages);
        const channelUpdatedAt = input.channelUpdatedAt ?? now;
        channel.updatedAt = channelUpdatedAt;

        const recipients = this.resolveRecipients(ws, channel, mentions, input.senderId);
        const delivery: DeliveryPlan = {
            channelId: channel.id,
            messageId: message.id,
            recipients,
            mentionedAgents: mentions.agentMentions,
            mentionedGroups: mentions.groupMentions
        };
        this.emit({
            type: "message_posted",
            workspaceId: input.workspaceId,
            channelId: channel.id,
            message,
            delivery,
            at: Date.now()
        });
        return { message, delivery, channelUpdatedAt };
    }

    public listMessages(workspaceId: string, channelId: string, opts: { threadRootId?: string } = {}): ChannelMessage[] {
        const ws = this.getWorkspace(workspaceId);
        this.getChannel(ws, channelId);
        const all = ws.messagesByChannel.get(channelId) || [];
        if (!opts.threadRootId) return [...all];
        return all.filter((message) => message.id === opts.threadRootId || message.threadRootId === opts.threadRootId);
    }

    public searchMessages(workspaceId: string, query: string, opts: SearchMessagesOptions = {}): ChannelMessage[] {
        const ws = this.getWorkspace(workspaceId);
        const normalized = query.trim().toLowerCase();
        if (!normalized) return [];
        const tokens = normalized.split(/\s+/).filter(Boolean);
        const channelIds = opts.channelId ? [opts.channelId] : Array.from(ws.messagesByChannel.keys());
        const results: Array<{ message: ChannelMessage; score: number }> = [];
        for (const channelId of channelIds) {
            const messages = ws.messagesByChannel.get(channelId) || [];
            for (const message of messages) {
                if (opts.threadRootId && message.id !== opts.threadRootId && message.threadRootId !== opts.threadRootId) continue;
                if (opts.senderId && message.senderId !== opts.senderId) continue;
                const haystack = `${message.text} ${(message.mentions || []).join(" ")}`.toLowerCase();
                const matched = tokens.filter((token) => haystack.includes(token)).length;
                if (matched === 0) continue;
                results.push({ message, score: matched });
            }
        }
        results.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.message.createdAt - a.message.createdAt;
        });
        return results.slice(0, Math.max(1, opts.limit || 20)).map((item) => item.message);
    }

    public addReaction(
        workspaceId: string,
        channelId: string,
        messageId: string,
        agentId: string,
        emoji: string,
        options: { updatedAt?: number } = {}
    ): ChannelMessage {
        const ws = this.getWorkspace(workspaceId);
        this.assertAgentExists(ws, agentId);
        const messages = ws.messagesByChannel.get(channelId) || [];
        const message = messages.find((item) => item.id === messageId);
        if (!message) {
            throw new Error(`Message not found: ${messageId}`);
        }
        const users = new Set(message.reactions[emoji] || []);
        users.add(agentId);
        message.reactions[emoji] = Array.from(users);
        message.updatedAt = options.updatedAt ?? Date.now();
        this.emit({
            type: "reaction_added",
            workspaceId,
            channelId,
            messageId,
            agentId,
            emoji,
            at: Date.now()
        });
        return message;
    }

    public onEvent(listener: (event: AgentCommunicationDomainEvent) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public listChannelsForAgent(workspaceId: string, agentId: string): CommunicationChannel[] {
        const ws = this.getWorkspace(workspaceId);
        const agent = this.getAgent(ws, agentId);
        return Array.from(ws.channels.values()).filter((channel) => this.canAccessChannel(channel, agent, ws));
    }

    public listChannels(workspaceId: string): CommunicationChannel[] {
        const ws = this.getWorkspace(workspaceId);
        return Array.from(ws.channels.values());
    }

    public exportState(): AgentCommunicationHubState {
        const workspaces = Array.from(this.workspaces.entries()).map(([workspaceId, ws]) => {
            const channels = Array.from(ws.channels.values()).map((channel) => ({
                id: channel.id,
                workspaceId: channel.workspaceId,
                name: channel.name,
                type: channel.type,
                createdBy: channel.createdBy,
                team: channel.team,
                department: channel.department,
                isPrivate: channel.isPrivate,
                members: Array.from(channel.members.values()),
                createdAt: channel.createdAt,
                updatedAt: channel.updatedAt
            }));
            const messages = Array.from(ws.messagesByChannel.values()).flatMap((list) => list);
            return {
                workspaceId,
                agents: Array.from(ws.agents.values()),
                channels,
                messages
            };
        });
        return { version: 1, workspaces };
    }

    public importState(state: AgentCommunicationHubState | undefined): void {
        if (!state || state.version !== 1 || !Array.isArray(state.workspaces)) return;
        this.workspaces.clear();
        for (const wsState of state.workspaces) {
            const ws: WorkspaceState = {
                agents: new Map(),
                channels: new Map(),
                messagesByChannel: new Map()
            };
            for (const agent of wsState.agents || []) {
                ws.agents.set(agent.id, { ...agent });
            }
            for (const channel of wsState.channels || []) {
                ws.channels.set(channel.id, {
                    ...channel,
                    members: new Map((channel.members || []).map((member) => [member.agentId, member]))
                });
                ws.messagesByChannel.set(channel.id, []);
            }
            for (const message of wsState.messages || []) {
                const list = ws.messagesByChannel.get(message.channelId) || [];
                list.push({ ...message });
                ws.messagesByChannel.set(message.channelId, list);
            }
            this.workspaces.set(wsState.workspaceId, ws);
        }
    }

    public applyEvent(event: AgentCommunicationEvent): void {
        if (event.kind === "register_agent") {
            this.registerAgent(event.workspaceId, event.identity);
            return;
        }
        if (event.kind === "create_channel") {
            this.createChannel({
                workspaceId: event.workspaceId,
                id: event.channel.id,
                name: event.channel.name,
                type: event.channel.type,
                createdBy: event.channel.createdBy,
                team: event.channel.team,
                department: event.channel.department,
                isPrivate: event.channel.isPrivate,
                members: event.channel.members,
                createdAt: event.channel.createdAt,
                updatedAt: event.channel.updatedAt
            });
            return;
        }
        if (event.kind === "join_channel") {
            this.joinChannel(event.workspaceId, event.channelId, event.member.agentId, {
                role: event.member.role,
                joinedAt: event.member.joinedAt,
                updatedAt: event.channelUpdatedAt
            });
            return;
        }
        if (event.kind === "post_message") {
            this.postMessage({
                workspaceId: event.workspaceId,
                channelId: event.message.channelId,
                senderId: event.message.senderId,
                text: event.message.text,
                threadRootId: event.message.threadRootId,
                metadata: event.message.metadata,
                id: event.message.id,
                createdAt: event.message.createdAt,
                updatedAt: event.message.updatedAt,
                mentions: event.message.mentions,
                reactions: event.message.reactions,
                channelUpdatedAt: event.channelUpdatedAt
            });
            return;
        }
        if (event.kind === "add_reaction") {
            this.addReaction(
                event.workspaceId,
                event.channelId,
                event.messageId,
                event.agentId,
                event.emoji,
                { updatedAt: event.updatedAt }
            );
        }
    }

    private resolveRecipients(
        ws: WorkspaceState,
        channel: CommunicationChannel,
        mentions: ReturnType<typeof parseMentions>,
        senderId: string
    ): string[] {
        const recipients = new Set<string>();
        for (const memberId of channel.members.keys()) {
            if (memberId === senderId) continue;
            recipients.add(memberId);
        }

        for (const mention of mentions.agentMentions) {
            if (ws.agents.has(mention) && mention !== senderId) recipients.add(mention);
        }
        for (const group of mentions.groupMentions) {
            if (group.startsWith("team:")) {
                const team = group.slice("team:".length);
                for (const agent of ws.agents.values()) {
                    if (agent.team === team && agent.id !== senderId) recipients.add(agent.id);
                }
            }
            if (group.startsWith("department:")) {
                const department = group.slice("department:".length);
                for (const agent of ws.agents.values()) {
                    if (agent.department === department && agent.id !== senderId) recipients.add(agent.id);
                }
            }
            if (group === "channel") {
                for (const memberId of channel.members.keys()) {
                    if (memberId !== senderId) recipients.add(memberId);
                }
            }
        }
        return Array.from(recipients).sort();
    }

    private canPost(channel: CommunicationChannel, agent: AgentIdentity, ws: WorkspaceState): boolean {
        if (agent.role === "owner" || agent.role === "admin") return true;
        if (channel.type === "general") return true;
        if (channel.type === "team") return Boolean(agent.team && channel.team && agent.team === channel.team);
        if (channel.type === "department") {
            return Boolean(agent.department && channel.department && agent.department === channel.department);
        }
        if (channel.type === "private" || channel.type === "project" || channel.type === "incident" || channel.type === "dm") {
            return channel.members.has(agent.id);
        }
        return ws.agents.has(agent.id);
    }

    private canAccessChannel(channel: CommunicationChannel, agent: AgentIdentity, ws: WorkspaceState): boolean {
        if (agent.role === "owner" || agent.role === "admin") return true;
        if (channel.type === "general") return true;
        if (channel.type === "team") return Boolean(agent.team && channel.team && agent.team === channel.team);
        if (channel.type === "department") {
            return Boolean(agent.department && channel.department && agent.department === channel.department);
        }
        if (channel.isPrivate || channel.type === "private" || channel.type === "dm") {
            return channel.members.has(agent.id);
        }
        return ws.agents.has(agent.id);
    }

    private canManageChannel(channel: CommunicationChannel, agent: AgentIdentity): boolean {
        if (agent.role === "owner" || agent.role === "admin") return true;
        return channel.createdBy === agent.id;
    }

    private getWorkspace(workspaceId: string): WorkspaceState {
        this.ensureWorkspace(workspaceId);
        return this.workspaces.get(workspaceId)!;
    }

    private getAgent(ws: WorkspaceState, agentId: string): AgentIdentity {
        const agent = ws.agents.get(agentId);
        if (!agent) throw new Error(`Unknown agent: ${agentId}`);
        return agent;
    }

    private assertAgentExists(ws: WorkspaceState, agentId: string): void {
        if (!ws.agents.has(agentId)) throw new Error(`Unknown agent: ${agentId}`);
    }

    private getChannel(ws: WorkspaceState, channelId: string): CommunicationChannel {
        const channel = ws.channels.get(channelId);
        if (!channel) throw new Error(`Unknown channel: ${channelId}`);
        return channel;
    }

    private emit(event: AgentCommunicationDomainEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch {
                // listener failures must not break domain flow
            }
        }
    }
}

export type AgentCommunicationEvent =
    | {
          kind: "register_agent";
          workspaceId: string;
          identity: AgentIdentity;
      }
    | {
          kind: "create_channel";
          workspaceId: string;
          channel: Omit<CommunicationChannel, "members"> & { members: ChannelMember[] };
      }
    | {
          kind: "join_channel";
          workspaceId: string;
          channelId: string;
          member: ChannelMember;
          channelUpdatedAt?: number;
      }
    | {
          kind: "post_message";
          workspaceId: string;
          message: ChannelMessage;
          channelUpdatedAt?: number;
      }
    | {
          kind: "add_reaction";
          workspaceId: string;
          channelId: string;
          messageId: string;
          agentId: string;
          emoji: string;
          updatedAt?: number;
      };

function slug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "channel";
}

function parseMentions(text: string): {
    tokens: string[];
    agentMentions: string[];
    groupMentions: string[];
} {
    const tokens = Array.from(new Set(Array.from(text.matchAll(/@([a-zA-Z0-9:_-]+)/g)).map((m) => m[1])));
    const agentMentions: string[] = [];
    const groupMentions: string[] = [];
    for (const token of tokens) {
        if (token.startsWith("team:") || token.startsWith("department:") || token === "channel") {
            groupMentions.push(token);
            continue;
        }
        agentMentions.push(token);
    }
    return { tokens, agentMentions, groupMentions };
}

function normalizeMentions(text: string, explicit?: string[]): ReturnType<typeof parseMentions> {
    if (!explicit?.length) return parseMentions(text);
    const tokens = Array.from(new Set(explicit));
    const agentMentions: string[] = [];
    const groupMentions: string[] = [];
    for (const token of tokens) {
        if (token.startsWith("team:") || token.startsWith("department:") || token === "channel") {
            groupMentions.push(token);
            continue;
        }
        agentMentions.push(token);
    }
    return { tokens, agentMentions, groupMentions };
}
