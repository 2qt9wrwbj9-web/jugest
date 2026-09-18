# JUGEST ChatGPT OAuth Design

## Goal

Allow ChatGPT to connect to `https://jugest.net/mcp` using OAuth 2.1 while preserving the existing JUGEST Collector authentication and keeping all setting judgement/PRE math unchanged.

## Scope

- Add a minimal JUGEST-hosted OAuth authorization server for the private JUGEST MCP connection.
- Support OAuth Authorization Code + PKCE (`S256`) and refresh tokens.
- Support Dynamic Client Registration (DCR) for ChatGPT.
- Bind an OAuth grant to one existing JUGEST Collector channel only after the user proves possession of that channel's `channelId` and `receiverToken` on the JUGEST authorization page.
- Keep the existing Collector receiver-token authentication available for existing internal/legacy callers.
- Do not change Juggler judgement math, PRE v2, store ownership rules, data collection, or persistence schemas outside the relay KV namespace.

## OAuth endpoints

JUGEST is both the MCP resource server and OAuth authorization server.

- `GET /.well-known/oauth-protected-resource`
  - `resource`: `https://jugest.net/mcp`
  - `authorization_servers`: `["https://jugest.net"]`
  - `scopes_supported`: `["jugest:read"]`
- `GET /.well-known/oauth-authorization-server`
  - issuer `https://jugest.net`
  - authorization endpoint `/oauth/authorize`
  - token endpoint `/oauth/token`
  - registration endpoint `/oauth/register`
  - authorization code + refresh token grants
  - PKCE method `S256`
  - token endpoint auth method `none`
  - `authorization_response_iss_parameter_supported: true`
- `POST /oauth/register`
  - public-client DCR only; no client secret
  - accepts only redirect URIs under `https://chatgpt.com`, `https://chat.openai.com`, or loopback `http://127.0.0.1` / `http://localhost`
- `GET /oauth/authorize`
  - validates the OAuth request and renders a small JUGEST login/consent form
- `POST /oauth/authorize`
  - validates Collector `channelId` + `receiverToken`
  - creates a single-use authorization code and redirects to the registered redirect URI with `code`, `state`, and `iss`
- `POST /oauth/token`
  - exchanges authorization code + PKCE verifier for opaque access/refresh tokens
  - rotates refresh tokens on refresh

## Token model

OAuth state is stored in the existing persistent relay SQLite DB under a new `jugest-oauth-v1` relay-store namespace. Raw authorization codes and raw tokens are never stored; only SHA-256 digests are used as keys.

Access-token record:
- token type: access
- issuer: `https://jugest.net`
- audience/resource: `https://jugest.net/mcp`
- scope: `jugest:read`
- clientId
- channelId
- issuedAt / expiresAt

Refresh-token record additionally has a longer expiry and is rotated on each successful refresh.

Authorization codes expire after 5 minutes and are single-use. Access tokens expire after 1 hour. Refresh tokens expire after 30 days.

## MCP authentication behavior

`initialize`, `server/discover`, `ping`, and `tools/list` remain callable without an authenticated account so ChatGPT can discover the server and each tool's OAuth requirements.

Every JUGEST tool descriptor declares:

```json
{
  "securitySchemes": [{"type":"oauth2","scopes":["jugest:read"]}],
  "_meta": {"securitySchemes":[{"type":"oauth2","scopes":["jugest:read"]}]}
}
```

`tools/call` requires either:
1. a valid JUGEST OAuth access token, or
2. the existing internal Collector `Authorization: Bearer <receiverToken>` plus `x-jugest-channel-id` headers.

If neither is valid, MCP returns a tool error with `_meta["mcp/www_authenticate"]` pointing to `https://jugest.net/.well-known/oauth-protected-resource`, including both `error` and `error_description`. Direct HTTP authentication failures also include a `WWW-Authenticate` challenge where applicable.

After OAuth validation, the access token yields the same `channelId` used by current store ownership checks. No authorization decision is delegated to the model.

## Authorization page

The page is intentionally minimal and server-rendered. It displays the requesting client name when available, the requested `jugest:read` scope, and inputs for JUGEST channel ID and receiver token. The receiver token is submitted only over HTTPS and is never persisted by the OAuth layer.

No cookies or long-lived login session are required for v1.

## Security constraints

- Exact-match `resource=https://jugest.net/mcp` throughout the OAuth flow.
- Exact registered redirect URI match at authorization and token exchange.
- PKCE `S256` mandatory; `plain` rejected.
- DCR restricted to ChatGPT/OpenAI HTTPS callbacks and loopback callbacks used by development/Inspector/Codex.
- No client secret issuance.
- OAuth codes/tokens generated with cryptographically secure random bytes.
- Raw OAuth credentials are never logged or stored.
- Existing MCP origin restrictions remain.
- Existing store/channel ownership checks remain authoritative.
- All tools remain read-only/compute-only.

## Compatibility

Existing Collector/API flows are unchanged. Existing internal MCP receiver-token calls continue to work so current tests and manual diagnostics remain available. The ChatGPT Plugin manifest continues to reference `https://jugest.net/mcp`; OAuth is discovered from MCP/OAuth metadata rather than hardcoded secrets in the plugin package.

## Testing

Add tests for:
- protected-resource metadata and authorization-server metadata
- DCR success and redirect-URI rejection
- authorization request validation
- bad Collector credentials
- successful authorization-code + PKCE exchange
- code single-use behavior
- wrong verifier / wrong redirect / wrong resource
- refresh-token rotation
- expired/invalid access token rejection
- unauthenticated MCP discovery/tool list with OAuth security schemes
- unauthenticated `tools/call` returns OAuth challenge metadata
- OAuth-authenticated `judge_machines` and store tools
- legacy Collector-authenticated MCP calls still work
- existing full VPS and root regression suites remain green
