import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface StatusDisplayProps {
    tokenCount: number;
    cost: number;
    model: string;
}

/**
 * StatusDisplay
 * A compact bar showing current session statistics and model info.
 */
export const StatusDisplay: React.FC<StatusDisplayProps> = ({ tokenCount, cost, model }) => {
    return (
        <Box
            paddingX={1}
            borderStyle="single"
            borderColor={colors.border}
            justifyContent="space-between"
            width="100%"
        >
            <Box>
                <Text color={colors.accent} bold>MODEL </Text>
                <Text color={colors.foreground}>{model}</Text>
            </Box>
            <Box>
                <Box marginRight={2}>
                    <Text color={colors.muted}>TOKENS: </Text>
                    <Text color={colors.foreground}>{tokenCount.toLocaleString()}</Text>
                </Box>
                <Box>
                    <Text color={colors.muted}>COST: </Text>
                    <Text color={colors.success}>${cost.toFixed(4)}</Text>
                </Box>
            </Box>
        </Box>
    );
};
