# Configuration Guide

## Core runtime

Common environment variables:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `AWS_REGION` (for Bedrock)

## Ollama

- `OLLAMA_BASE_URL`
- `OLLAMA_CONNECTION` (`local` or `remote`)
- `OLLAMA_PROTOCOL`
- `OLLAMA_HOST`
- `OLLAMA_PORT`
- `OLLAMA_API_KEY`

## llama.cpp

- `LLAMA_CPP_SERVER_PATH`
- `LLAMA_CPP_MODEL_DIR`
- `LLAMA_CPP_MODEL`
- `LLAMA_CPP_GPU` (hint)

## Hugging Face for llama.cpp recommendations

- `LLAMA_CPP_HF_ENABLED=1`
- `HUGGINGFACE_TOKEN`
- `HUGGINGFACE_ENDPOINT`
- `LLAMA_CPP_HF_SEARCH`
- `LLAMA_CPP_HF_LIMIT`

## OAuth foundation

Provider profile IDs currently included:

- `codex`
- `claude-code`
- `cursor`
- `gemini-cli`

Credential storage modes:

- `auto` (preferred)
- `file`
- `keyring` (requires adapter)
