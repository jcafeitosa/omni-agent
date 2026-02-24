import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputProps {
    onSubmit: (value: string) => void;
    placeholder?: string;
}

export const Input: React.FC<InputProps> = ({ onSubmit, placeholder = "Type your command..." }) => {
    const [query, setQuery] = useState('');

    const handleSubmit = (value: string) => {
        setQuery('');
        onSubmit(value);
    };

    return (
        <Box marginTop={1}>
            <Box marginRight={1}>
                <Text color="magenta" bold>{'>'}</Text>
            </Box>
            <TextInput
                value={query}
                onChange={setQuery}
                onSubmit={handleSubmit}
                placeholder={placeholder}
            />
        </Box>
    );
};
