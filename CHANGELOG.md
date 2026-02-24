# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Native `llama.cpp` provider with local model management.
- Hugging Face recommendations and optional auto-download for GGUF models.
- OAuth foundation layer (`OAuthManager`, credential stores, provider profiles).
- Provider model availability and cooldown manager.

### Changed

- Provider abstraction now supports `listAvailableModels()`.
- Ollama provider supports local or remote connection modes.
