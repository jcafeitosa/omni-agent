# OAuth and Model Management

## OAuth foundation (`packages/core/src/auth`)

- `OAuthManager`: profile registry, credential retrieval, token refresh orchestration.
- `OAuthCredentialStore`: pluggable storage abstraction.
- Store modes: `auto`, `file`, `keyring`.

## Model availability and cooldown

- `ModelAvailabilityManager` (`packages/core/src/models/model-availability.ts`)
  - tracks provider/model availability
  - cooldown on failures
  - model selection excluding cooldown entries
  - periodic auto-refresh support

- `ProviderModelManager` (`packages/providers/src/model-manager.ts`)
  - refreshes models per provider
  - falls back to local catalog if provider listing fails
  - central point for multi-provider selection workflows

## Routing and fallback

- `ModelRouter` (`packages/providers/src/routing.ts`)
  - executes `generateText` with provider/model fallback
  - integrates with cooldown (`markFailure`) automatically on errors
  - supports provider priority and max-attempt controls

- `RoutedProvider` (`packages/providers/src/routed-provider.ts`)
  - wrapper implementing core `Provider`
  - plugs router fallback into existing runtimes (CLI/AgentLoop) without core changes
