import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../../theme.js';

interface DiffRendererProps {
    diff: string;
}

export const DiffRenderer: React.FC<DiffRendererProps> = ({ diff }) => {
    const lines = diff.split('\n');

    return (
        <Box flexDirection="column" marginTop={1} paddingX={1} borderStyle="single" borderColor={colors.muted}>
            {lines.map((line, i) => {
                let color = colors.foreground;
                let prefix = '';

                if (line.startsWith('+')) {
                    color = colors.success;
                    // prefix = '+';
                } else if (line.startsWith('-')) {
                    color = colors.error;
                    // prefix = '-';
                } else if (line.startsWith('@@')) {
                    color = colors.accent;
                } else if (line.startsWith('---') || line.startsWith('+++')) {
                    color = colors.muted;
                }

                return (
                    <Box key={i}>
                        <Text color={color}>{line}</Text>
                    </Box>
                );
            })}
        </Box>
    );
};
