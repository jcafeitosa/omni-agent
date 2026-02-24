import React from 'react';
import { Box, Text } from 'ink';
import { AgentMessage } from '@omni-agent/core';
import { colors } from '../theme.js';
import { ToolMessage } from './messages/ToolMessage.js';

interface DetailedMessagesDisplayProps {
    messages: AgentMessage[];
}

/**
 * DetailedMessagesDisplay
 * A premium message list with rich component rendering for different message roles.
 */
export const DetailedMessagesDisplay: React.FC<DetailedMessagesDisplayProps> = ({ messages }) => {
    return (
        <Box flexDirection="column">
            {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const isAssistant = msg.role === 'assistant';
                const isTool = msg.role === 'toolResult';

                if (isAssistant && msg.toolCalls && msg.toolCalls.length > 0) {
                    // Find subsequent tool results that match these calls
                    const results: any[] = [];
                    let j = index + 1;
                    while (j < messages.length && messages[j].role === 'toolResult') {
                        results.push(messages[j]);
                        j++;
                    }
                    return <ToolMessage key={index} message={msg} toolResults={results} />;
                }

                if (isTool) {
                    // Skip tool results as they are now handled inside ToolMessage
                    return null;
                }

                return (
                    <Box key={index} flexDirection="column" marginBottom={1}>
                        <Box>
                            <Text color={isUser ? colors.accent : colors.success} bold>
                                {isUser ? 'You ' : 'OmniAgent '}
                            </Text>
                        </Box>
                        <Box paddingLeft={2}>
                            <Text color={colors.foreground}>{msg.text}</Text>
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};
