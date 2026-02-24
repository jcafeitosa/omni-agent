# OAuth Multi-Account Balancing

`OAuthManager` suporta multiplas contas por provider OAuth, com balanceamento configuravel.

## Principais metodos

- `saveAccountCredentials(providerId, accountId, credentials)`
- `loadAccountCredentials(providerId, accountId)`
- `listAccountIds(providerId)`
- `deleteAccountCredentials(providerId, accountId)`
- `acquireAccessToken(providerId, { accountId?, strategy? })`
- `setProviderStrategy(providerId, strategy)`

## Estrategias

- `single`: usa a primeira conta disponivel
- `round_robin`: alterna entre contas
- `least_recent`: usa a conta menos recentemente utilizada
- `parallel`: prioriza contas com menor carga em uso simultaneo
- `random`: escolha aleatoria

Todas as estrategias filtram contas com rate limit ativo quando houver alternativa disponivel.  
Se todas estiverem limitadas, o sistema escolhe a conta com menor `resetAt` previsto.

## Rate limits de conta

`OAuthManager.reportRateLimit(providerId, accountId, info)` permite registrar:

- `remaining`
- `limit`
- `retryAfterMs`
- `resetAt`

O roteador usa essa telemetria para evitar contas limitadas automaticamente.

## Integracao com roteamento de modelos

`ModelRouter` aceita:

- `oauthManager`
- `oauthStrategy`
- `oauthProfileByProvider`

Por requisicao (`GenerateWithFallbackRequest`):

- `oauthAccountId`
- `oauthStrategy`

Assim o roteador injeta automaticamente token OAuth da conta escolhida nas opcoes do provider.

## CLI

No pacote `@omni-agent/cli`:

- `--oauth-account <id>`
- `--oauth-strategy single|round_robin|least_recent|parallel|random`
