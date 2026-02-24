import React, { useState, useEffect } from 'react';
import { Box, useApp } from 'ink';
import { AgentMessage } from '@omni-agent/core';
import { DetailedMessagesDisplay } from './components/DetailedMessagesDisplay.js';
import { InputPrompt } from './components/InputPrompt.js';
import { StatusDisplay } from './components/StatusDisplay.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useFocus } from './hooks/useFocus.js';

interface AppContainerProps {
    messages: AgentMessage[];
    onSubmit: (value: string) => void;
    model: string;
    tokenCount: number;
    cost: number;
    isResponding: boolean;
}

/**
 * AppContainer
 * The main container for the OmniAgent CLI, managing layout and high-level state.
 */
export const AppContainer: React.FC<AppContainerProps> = ({
    messages,
    onSubmit,
    model,
    tokenCount,
    cost,
    isResponding
}) => {
    const { rows } = useTerminalSize();
    const { isFocused } = useFocus();
    const { exit } = useApp();

    // Handle global quiting
    useEffect(() => {
        const onData = (data: Buffer) => {
            if (data.toString() === '\u0003') { // Ctrl+C
                exit();
                process.exit(0);
            }
        };
        process.stdin.on('data', onData);
        return () => {
            process.stdin.off('data', onData);
        };
    }, [exit]);

    return (
        <Box flexDirection="column" height={rows} justifyContent="space-between" paddingX={1}>
            <Box flexDirection="column" flexGrow={1}>
                {/* Header or Banner could go here */}
                <Box marginTop={1} flexGrow={1} flexDirection="column">
                    <DetailedMessagesDisplay messages={messages} />
                </Box>
            </Box>

            <Box flexDirection="column">
                <StatusDisplay
                    model={model}
                    tokenCount={tokenCount}
                    cost={cost}
                />
                <InputPrompt
                    onSubmit={onSubmit}
                    focus={!isResponding && isFocused}
                    placeholder={isResponding ? "OmniAgent is thinking..." : "Type your message or /index for RAG..."}
                />
            </Box>
        </Box>
    );
};
