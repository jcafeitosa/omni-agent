import React from 'react';
import { Box, Text } from 'ink';
import { AgentMessage } from '@omni-agent/core';
import { colors } from '../../theme.js';
import { DiffRenderer } from './DiffRenderer.js';

interface ToolMessageProps {
    message: AgentMessage;
    toolResults?: AgentMessage[];
}

/**
 * ToolMessage
 * Renders tool calls with a premium aesthetic, showing the status, name, and arguments.
 */
export const ToolMessage: React.FC<ToolMessageProps> = ({ message, toolResults = [] }) => {
    if (!message.toolCalls) return null;

    return (
        <Box flexDirection="column" marginBottom={1}>
            {message.text && (
                <Box marginBottom={1}>
                    <Text color={colors.success} bold>OmniAgent </Text>
                    <Box paddingLeft={2}>
                        <Text color={colors.foreground}>{message.text}</Text>
                    </Box>
                </Box>
            )}

            {message.toolCalls.map((call, i) => {
                const isDelegate = call.name === 'delegate';
                const isParallel = call.name === 'parallel_delegate';
                const isBrowser = call.name === 'browser';
                const borderColor = (isDelegate || isParallel || isBrowser) ? colors.success : colors.accent;

                let label = 'Tool Call:';
                if (isDelegate) label = 'Spawning Sub-Agent...';
                if (isParallel) label = 'Orchestrating Specialized Agents (Parallel)...';
                if (isBrowser) label = 'Browser Action:';
                const result = toolResults[i];

                return (
                    <Box key={i} flexDirection="column" paddingX={2} marginTop={1}>
                        <Box borderStyle="round" borderColor={borderColor} paddingX={1}>
                            <Text color={borderColor} bold>{label} </Text>
                            <Text color={colors.foreground}>{call.name}</Text>
                        </Box>

                        <Box paddingLeft={2} marginTop={0} flexDirection="column">
                            {isDelegate ? (
                                <Box flexDirection="column" marginTop={1}>
                                    <Text color={colors.foreground} bold>Role: {(call.args as any).role}</Text>
                                    <Text color={colors.muted} italic>Task: {(call.args as any).task}</Text>
                                </Box>
                            ) : isParallel ? (
                                <Box flexDirection="column" marginTop={1}>
                                    <Text color={colors.foreground} bold>Specialists:</Text>
                                    {(call.args as any).agents.map((agent: any, idx: number) => (
                                        <Box key={idx} paddingLeft={2}>
                                            <Text color={colors.success}>• </Text>
                                            <Text color={colors.foreground} bold>{agent.role}: </Text>
                                            <Text color={colors.muted}>{agent.task}</Text>
                                        </Box>
                                    ))}
                                </Box>
                            ) : isBrowser ? (
                                <Box flexDirection="column" marginTop={1}>
                                    <Text color={colors.foreground} bold>Action: {(call.args as any).action}</Text>
                                    {(call.args as any).url && <Text color={colors.muted}>URL: {(call.args as any).url}</Text>}
                                    {(call.args as any).selector && <Text color={colors.muted}>Selector: {(call.args as any).selector}</Text>}
                                </Box>
                            ) : (
                                <Box marginTop={1}>
                                    <Text color={colors.muted} dimColor>
                                        {JSON.stringify(call.args, null, 2)}
                                    </Text>
                                </Box>
                            )}

                            {result && (
                                <Box marginTop={1} flexDirection="column">
                                    <Text color={colors.accent} bold>Result:</Text>
                                    {(() => {
                                        const text = result.text || '';
                                        try {
                                            if (text.startsWith('{')) {
                                                const parsed = JSON.parse(text);
                                                if (parsed.diff) {
                                                    return (
                                                        <Box flexDirection="column">
                                                            <Text color={colors.foreground}>{parsed.message}</Text>
                                                            <DiffRenderer diff={parsed.diff} />
                                                        </Box>
                                                    );
                                                }
                                            }
                                        } catch (e) {
                                            // Fallback
                                        }
                                        return <Text color={colors.foreground}>{text}</Text>;
                                    })()}
                                </Box>
                            )}
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};
