import React, { useState, useEffect } from 'react';
import { AgentLoop, AgentSession, AgentMessage, Provider, ToolDefinition, Query, SessionStore, EventLogStore } from '@omni-agent/core';
import { AppContainer } from './AppContainer.js';

interface AppProps {
    provider: Provider;
    tools: Map<string, ToolDefinition>;
    sessionFile?: string;
    eventLogFile?: string;
}

export const App: React.FC<AppProps> = ({ provider, tools, sessionFile, eventLogFile }) => {
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [isResponding, setIsResponding] = useState(false);
    const [stats, setStats] = useState({ tokenCount: 0, cost: 0 });
    const [activeQuery, setActiveQuery] = useState<Query | null>(null);

    // Initialize session once
    const [session] = useState(() => new AgentSession());
    const [eventLogStore] = useState(
        () => (eventLogFile ? new EventLogStore({ filePath: eventLogFile, batchSize: 32, flushIntervalMs: 200 }) : undefined)
    );
    const [loop] = useState(() => new AgentLoop({ session, provider, tools, eventLogStore }));

    useEffect(() => {
        // @ts-ignore
        loop.initialize().catch((err: Error) => console.error("Failed to initialize loop:", err.message));
    }, [loop]);

    useEffect(() => {
        if (!sessionFile) return;
        const store = new SessionStore({ filePath: sessionFile });
        store
            .load()
            .then((loaded: AgentSession | null) => {
                if (!loaded) return;
                session.restoreFromJSON(loaded.toJSON());
                setMessages([...session.getMessages()]);
            })
            .catch((err: Error) => console.error("Failed to load session:", err.message));
    }, [sessionFile, session]);

    const handleInput = async (input: string) => {
        setIsResponding(true);
        setMessages([...session.getMessages()]);

        const query = loop.runStream(input);
        setActiveQuery(query);

        try {
            for await (const event of query) {
                // Update messages on most events
                if (['text', 'tool_use', 'tool_result', 'result'].includes(event.type)) {
                    setMessages([...session.getMessages()]);
                }

                if (event.type === 'result') {
                    // Update stats if available in the event (future-proofing)
                }
            }
        } catch (error: any) {
            setMessages([...session.getMessages()]);
        } finally {
            if (sessionFile) {
                const store = new SessionStore({ filePath: sessionFile });
                try {
                    await store.save(session);
                } catch (error: any) {
                    console.error("Failed to save session:", error?.message || String(error));
                }
            }
            setIsResponding(false);
            setActiveQuery(null);
            // In a real scenario, we'd update stats from the provider response
            setStats({
                tokenCount: session.getMessages().reduce((acc, m) => acc + (m.text?.length || 0) / 4, 0), // Mock token count
                cost: 0 // Mock cost
            });
        }
    };

    return (
        <AppContainer
            messages={messages}
            onSubmit={handleInput}
            model={provider.name}
            tokenCount={stats.tokenCount}
            cost={stats.cost}
            isResponding={isResponding}
        />
    );
};
