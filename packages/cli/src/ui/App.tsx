import React, { useState, useEffect } from 'react';
import { AgentLoop, AgentSession, AgentMessage, Provider, ToolDefinition, Query } from '@omni-agent/core';
import { AppContainer } from './AppContainer.js';

interface AppProps {
    provider: Provider;
    tools: Map<string, ToolDefinition>;
}

export const App: React.FC<AppProps> = ({ provider, tools }) => {
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [isResponding, setIsResponding] = useState(false);
    const [stats, setStats] = useState({ tokenCount: 0, cost: 0 });
    const [activeQuery, setActiveQuery] = useState<Query | null>(null);

    // Initialize session once
    const [session] = useState(() => new AgentSession());
    const [loop] = useState(() => new AgentLoop({ session, provider, tools }));

    useEffect(() => {
        // @ts-ignore
        loop.initialize().catch((err: Error) => console.error("Failed to initialize loop:", err.message));
    }, [loop]);

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
