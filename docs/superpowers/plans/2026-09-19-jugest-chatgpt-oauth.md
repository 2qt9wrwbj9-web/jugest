# JUGEST ChatGPT OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal OAuth 2.1 authorization server to JUGEST so ChatGPT can securely connect to the existing private MCP tools.

**Architecture:** JUGEST hosts OAuth discovery, DCR, authorization, and token endpoints in the existing VPS web process. OAuth state is persisted in the existing relay SQLite KV store under a dedicated namespace, and successful OAuth access tokens resolve to the same Collector `channelId` already used by store ownership checks.

**Tech Stack:** Node.js 22+, built-in `node:crypto`, built-in HTTP server, existing `relay-store.mjs`, existing Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-19-jugest-chatgpt-oauth-design.md`

## Global Constraints

- Do not modify setting-judgement math, PRE v2, store ownership semantics, or collection behavior.
- Authorization Code + PKCE must require `S256`.
- OAuth resource is exactly `https://jugest.net/mcp` and issuer is exactly `https://jugest.net`.
- Raw OAuth authorization codes/access tokens/refresh tokens must not be persisted or logged.
- Existing Collector-authenticated MCP calls must remain supported.
- All JUGEST MCP tools remain read-only/compute-only.

---

### Task 1: OAuth protocol core and discovery

**Files:**
- Create: `vps/src/oauth-handler.mjs`
- Create: `vps/tests/oauth-api.test.mjs`
- Modify: `vps/src/web-server.mjs`

**Interfaces:**
- Produces `createOAuthHandler({relayDbPath})` for OAuth/well-known HTTP routes.
- Produces `authenticateOAuthAccessToken(token,{relayDbPath}) -> {channelId,clientId,scope}|null` for MCP.

- [ ] Write failing tests for protected-resource metadata, authorization-server metadata, DCR, redirect allow-list, and PKCE-required authorization validation.
- [ ] Run `cd vps && node --test tests/oauth-api.test.mjs` and confirm RED.
- [ ] Implement OAuth constants, metadata responses, DCR persistence, secure random identifiers, and authorization request validation.
- [ ] Mount well-known and `/oauth/*` routes in `web-server.mjs`.
- [ ] Run the OAuth test file and confirm the metadata/DCR tests pass.
- [ ] Commit.

### Task 2: Collector proof, authorization codes, and token lifecycle

**Files:**
- Modify: `vps/src/oauth-handler.mjs`
- Modify: `vps/tests/oauth-api.test.mjs`

**Interfaces:**
- Authorization POST proves possession of existing `channelId` + `receiverToken`.
- Token endpoint supports `authorization_code` and `refresh_token` grants.
- Opaque access tokens map to verified Collector `channelId` through relay KV records.

- [ ] Add failing tests for bad Collector credentials, successful authorize redirect, wrong PKCE verifier, single-use code, token issuance, exact resource/redirect checks, and refresh rotation.
- [ ] Run OAuth tests and confirm new tests fail.
- [ ] Implement server-rendered authorization form and Collector credential verification without persistence of receiver token.
- [ ] Implement 5-minute single-use authorization codes keyed by SHA-256 digest.
- [ ] Implement 1-hour access tokens and rotating 30-day refresh tokens keyed by SHA-256 digest.
- [ ] Implement `authenticateOAuthAccessToken` with issuer/resource/scope/expiry validation.
- [ ] Run OAuth tests and confirm GREEN.
- [ ] Commit.

### Task 3: MCP OAuth integration

**Files:**
- Modify: `vps/src/mcp-handler.mjs`
- Modify: `vps/tests/mcp-api.test.mjs`

**Interfaces:**
- Discovery/list methods are available before login.
- Every tool descriptor contains `securitySchemes` and mirrored `_meta.securitySchemes` for `jugest:read`.
- `tools/call` accepts either OAuth access token or legacy Collector receiver-token + channel header.
- Missing/invalid tool auth returns `_meta["mcp/www_authenticate"]` with resource metadata URL.

- [ ] Rewrite/add failing MCP tests for anonymous `server/discover`/`tools/list`, security scheme descriptors, OAuth challenge, OAuth-authenticated tool calls, and legacy auth compatibility.
- [ ] Run `cd vps && node --test tests/mcp-api.test.mjs` and confirm RED.
- [ ] Add OAuth security schemes to all six tools.
- [ ] Move authentication gating so discovery/list are public but `tools/call` is protected.
- [ ] Resolve OAuth bearer token to `channelId`; preserve legacy Collector auth as fallback.
- [ ] Return the OpenAI-compatible `mcp/www_authenticate` challenge on unauthenticated calls.
- [ ] Run MCP tests and confirm GREEN.
- [ ] Commit.

### Task 4: Full regression and plugin compatibility

**Files:**
- Modify only if required by tests: `plugins/jugest/*`, `vps/tests/jugest-plugin-package.test.mjs`

**Interfaces:**
- Plugin continues using `https://jugest.net/mcp` with no embedded secret.

- [ ] Run `cd vps && npm test`.
- [ ] Run root `npm test`.
- [ ] Verify OAuth metadata has no secrets and plugin package has no receiver token/channel ID.
- [ ] Compare feature branch to `deploy/vps`; confirm only OAuth/MCP/docs/tests changed.
- [ ] Stop before moving `deploy/vps`; request explicit production deployment permission.
