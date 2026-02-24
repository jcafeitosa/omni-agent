import React from 'react';
import { Box, Text } from 'ink';

interface StatusProps {
    status: string | null;
}

export const Status: React.FC<StatusProps> = ({ status }) => {
    if (!status) return null;

    return (
        <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
            <Text italic color="yellow">⏳ {status}</Text>
        </Box>
    );
};
