import React from 'react';
import { Box, Text } from 'ink';
import { AgentMessage } from '@omni-agent/core';
import chalk from 'chalk';

interface MessageListProps {
    messages: AgentMessage[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
    return (
        <Box flexDirection="column">
            {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const isAssistant = msg.role === 'assistant';
                const isTool = msg.role === 'toolResult';

                let color = 'white';
                let prefix = '';

                if (isUser) {
                    color = 'cyan';
                    prefix = 'You: ';
                } else if (isAssistant) {
                    color = 'green';
                    prefix = 'Agent: ';
                } else if (isTool) {
                    color = 'yellow';
                    prefix = 'Tool Result: ';
                }

                return (
                    <Box key={index} flexDirection="column" marginBottom={1}>
                        <Text color={color} bold>{prefix}</Text>
                        <Box paddingLeft={2}>
                            <Text>{msg.text || (msg.toolCalls ? `Calling tools: ${msg.toolCalls.map((t: any) => t.name).join(', ')}` : '')}</Text>
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};
