import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';

interface InputPromptProps {
    onSubmit: (value: string) => void;
    placeholder?: string;
    focus?: boolean;
}

/**
 * InputPrompt
 * A custom input component for OmniAgent with multiline support and simple history.
 */
export const InputPrompt: React.FC<InputPromptProps> = ({
    onSubmit,
    placeholder = "Type your message...",
    focus = true
}) => {
    const [input, setInput] = useState("");
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    useInput((inputStr, key) => {
        if (!focus) return;

        if (key.return) {
            if (input.trim()) {
                const value = input;
                setHistory(prev => [value, ...prev]);
                setHistoryIndex(-1);
                setInput("");
                onSubmit(value);
            }
            return;
        }

        if (key.backspace || key.delete) {
            setInput(prev => prev.slice(0, -1));
            return;
        }

        if (key.upArrow) {
            if (historyIndex < history.length - 1) {
                const newIndex = historyIndex + 1;
                setHistoryIndex(newIndex);
                setInput(history[newIndex]);
            }
            return;
        }

        if (key.downArrow) {
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setInput(history[newIndex]);
            } else {
                setHistoryIndex(-1);
                setInput("");
            }
            return;
        }

        if (inputStr && !key.ctrl && !key.meta) {
            setInput(prev => prev + inputStr);
        }
    });

    return (
        <Box flexDirection="column" marginTop={1}>
            <Box>
                <Text color={colors.accent} bold>{"> "}</Text>
                {input.length > 0 ? (
                    <Text color={colors.foreground}>{input}</Text>
                ) : (
                    <Text color={colors.muted} italic>{placeholder}</Text>
                )}
                <Text color={colors.accent} bold>_</Text>
            </Box>
        </Box>
    );
};
