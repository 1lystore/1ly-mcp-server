# @1ly/mcp-server

MCP server for [1ly.store](https://1ly.store) — Enable AI agents to discover, pay for, and sell APIs using crypto.

## Overview

This MCP server gives AI agents the ability to:

- **Buy** — Search, discover, and pay for APIs/resources with automatic crypto payments (x402 protocol)
- **Sell** — Create a store, list paid API endpoints or resources, and accept payments
- **Launch Tokens** — Create and trade tokens on Bags.fm, and claim fee shares

**Supported Networks:** Solana (mainnet), Base (mainnet)  
**Payment Currency:** USDC

## What is this?
This MCP server enables AI agents (Claude, GPT, Cursor, and more) to:

- Create a store on 1ly.store
- Accept payments for your APIs/resources using 1ly as the payment layer
- Create paid links that any x402‑compatible agent can call and pay automatically
- List paid links on the 1ly marketplace for instant agent discovery
- Search for APIs and services on 1ly.store
- Get details about pricing, reviews, and usage
- Call paid APIs with automatic crypto payments (x402 protocol) securely
- Leave reviews after purchases (optional but recommended)
— Launch tokens on Bags.fm, trade solana tokens, and claim fees


---

## Quick Start

**Wallet path rule:** wallet files must be located in your home directory (recommended) or `/tmp`. Paths outside those locations are rejected for security. `~/` is supported and expands to your home directory.
**Important:** Claude/Cursor config JSON does **not** expand `~`. Use an absolute path in JSON configs.

### 1. Install and Run

#### Option A: Raw Wallet (default)

```bash
# Solana wallet
ONELY_WALLET_SOLANA_KEY="~/.1ly/wallets/solana.json" npx @1ly/mcp-server

# OR Base/EVM wallet
ONELY_WALLET_EVM_KEY="~/.1ly/wallets/evm.key" npx @1ly/mcp-server

# OR both wallets
ONELY_WALLET_SOLANA_KEY="~/.1ly/wallets/solana.json" \
ONELY_WALLET_EVM_KEY="~/.1ly/wallets/evm.key" \
npx @1ly/mcp-server
```

#### Option B: Coinbase Agentic Wallet (Base only)

```bash
ONELY_WALLET_PROVIDER="coinbase" npx @1ly/mcp-server
```

> When using Agentic Wallet, you **do not** pass raw private keys.  
> Make sure the Coinbase Agentic Wallet app is running and authenticated.

If you haven't installed Agentic Wallet yet:
- Follow Coinbase Agentic Wallet docs: `https://docs.cdp.coinbase.com/agentic-wallet/welcome`
- Quick install:
```bash
npx skills add coinbase/agentic-wallet-skills
npx awal show
```

### 2. Verify Setup

```bash
ONELY_WALLET_SOLANA_KEY="~/.1ly/wallets/solana.json" npx @1ly/mcp-server --self-test
```
---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONELY_WALLET_SOLANA_KEY` | No | Path to Solana keypair JSON file, or inline JSON array |
| `ONELY_WALLET_EVM_KEY` | No | Path to EVM private key file, or inline hex key (with or without `0x`) |
| `ONELY_API_KEY` | No | API key for seller tools. Auto-loaded after `1ly_create_store` |
| `ONELY_BUDGET_PER_CALL` | No | Max USD per API call (default: `1.00`) |
| `ONELY_BUDGET_DAILY` | No | Daily USD spending limit (default: `50.00`) |
| `ONELY_BUDGET_STATE_FILE` | No | Path to local budget state file (default: `~/.1ly-mcp-budget.json`) |
| `ONELY_NETWORK` | No | Preferred network: `solana` or `base` (default: `solana`) |
| `ONELY_SOLANA_RPC_URL` | No | Solana RPC URL (default: `https://api.mainnet-beta.solana.com`) |
| `ONELY_API_BASE` | No | API base URL (default: `https://1ly.store`) |
| `ONELY_WALLET_PROVIDER` | No | `raw` (default) or `coinbase` (Agentic Wallet, Base-only) |

*A wallet is required only for **paid** calls. For free search/details you can run without a wallet.*
Use **one** of: `ONELY_WALLET_SOLANA_KEY`, `ONELY_WALLET_EVM_KEY`, or `ONELY_WALLET_PROVIDER=coinbase`.

### Claude Desktop Configuration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "1ly": {
      "command": "npx",
      "args": ["@1ly/mcp-server"],
      "env": {
        "ONELY_WALLET_SOLANA_KEY": "~/.1ly/wallets/solana.json",
        "ONELY_BUDGET_PER_CALL": "1.00",
        "ONELY_BUDGET_DAILY": "50.00"
      }
    }
  }
}
```

<details>
<summary>Base/EVM wallet configuration</summary>

```json
{
  "mcpServers": {
    "1ly": {
      "command": "npx",
      "args": ["@1ly/mcp-server"],
      "env": {
        "ONELY_WALLET_EVM_KEY": "~/.1ly/wallets/evm.key",
        "ONELY_BUDGET_PER_CALL": "1.00",
        "ONELY_BUDGET_DAILY": "50.00"
      }
    }
  }
}
```
</details>

### Cursor One-Click Install

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en-US/install-mcp?name=1ly&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJAMWx5L21jcC1zZXJ2ZXIiXSwiZW52Ijp7Ik9ORUxZX1dBTExFVF9TT0xBTkFfS0VZIjoiL2Fic29sdXRlL3BhdGgvdG8vc29sYW5hLmpzb24iLCJPTkVMWV9CVURHRVRfUEVSX0NBTEwiOiIxLjAwIiwiT05FTFlfQlVER0VUX0RBSUxZIjoiNTAuMDAifX0%3D)

Cursor uses `.cursor/mcp.json`. If you prefer manual setup, use:
```json
{
  "mcpServers": {
    "1ly": {
      "command": "npx",
      "args": ["@1ly/mcp-server"],
      "env": {
        "ONELY_WALLET_SOLANA_KEY": "/absolute/path/to/solana.json",
        "ONELY_BUDGET_PER_CALL": "1.00",
        "ONELY_BUDGET_DAILY": "50.00"
      }
    }
  }
}
```
<details>
<summary>Both Solana + Base wallets</summary>

```json
{
  "mcpServers": {
    "1ly": {
      "command": "npx",
      "args": ["@1ly/mcp-server"],
      "env": {
        "ONELY_WALLET_SOLANA_KEY": "~/.1ly/wallets/solana.json",
        "ONELY_WALLET_EVM_KEY": "~/.1ly/wallets/evm.key",
        "ONELY_BUDGET_PER_CALL": "1.00",
        "ONELY_BUDGET_DAILY": "50.00"
      }
    }
  }
}
```
</details>

---

## Tools Reference

### Buyer Tools

Wallet **required only for paid calls** (`1ly_call`). Search/details work without a wallet.

#### `1ly_search`

Search for APIs on 1ly.store marketplace.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | **Yes** | Search term (e.g., "weather api") |
| `type` | string | No | Filter: `"api"` or `"standard"` |
| `maxPrice` | number | No | Maximum price in USD |
| `minPrice` | number | No | Minimum price in USD |
| `limit` | number | No | Results to return (default: 10, max: 50) |

```json
{
  "query": "weather api",
  "type": "api",
  "maxPrice": 0.10
}
```

**Returns:**
```json
{
  "ok": true,
  "data": {
    "results": [
      {
        "title": "Real-time Weather",
        "endpoint": "/api/link/joe/weather",
        "price": "$0.010000000000000000 USDC",
        "type": "api",
        "seller": "Joe's APIs",
        "stats": { "buyers": 150, "rating": "95%" }
      }
    ],
    "total": 42,
    "showing": 10
  }
}
```

---

#### `1ly_get_details`

Get detailed information about a specific API.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `endpoint` | string | **Yes** | API endpoint (e.g., `"joe/weather"`) |

```json
{
  "endpoint": "joe/weather"
}
```

**Returns (example):**
```json
{
  "ok": true,
  "data": {
    "endpoint": "/api/link/joe/weather",
    "fullUrl": "https://1ly.store/api/link/joe/weather",
    "link": {
      "title": "Real-time Weather",
      "description": "Global weather data",
      "slug": "weather",
      "price": "0.010000000000000000",
      "currency": "USDC"
    },
    "paymentInfo": { "networks": ["solana", "base"] },
    "reviews": {
      "stats": { "total": 50, "positive": 48 },
      "recent": [{ "positive": true, "comment": "Fast!" }]
    }
  }
}
```

---

#### `1ly_call`

Call a paid API with automatic crypto payment.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `endpoint` | string | **Yes** | API endpoint (e.g., `"joe/weather"`) |
| `method` | string | No | HTTP method: `GET`, `POST`, `PUT`, `DELETE`, `PATCH` (default: `GET`) |
| `body` | object | No | Request body for POST/PUT/PATCH |
| `headers` | object | No | Additional headers |

```json
{
  "endpoint": "joe/weather",
  "method": "POST",
  "body": { "city": "NYC" }
}
```

**Returns (example):**
```json
{
  "ok": true,
  "data": {
    "data": {
      "temp": 72,
      "conditions": "sunny"
    },
    "_1ly": {
      "purchaseId": "abc123",
      "txHash": "tx_hash_here",
      "reviewUrl": "https://1ly.store/api/review/abc123",
      "reviewToken": "xyz789"
    }
  }
}
```

> **Note:** The `_1ly` object contains tokens needed for `1ly_review`. Save these if you want to leave a review.  
> For free APIs, `_1ly` may be `{ "note": "No payment required (free API)" }`.

**Agentic Wallet (Base only):**
- Set `ONELY_WALLET_PROVIDER=coinbase`.
- Ensure Coinbase Agentic Wallet is installed, running, and authenticated.
- Local private keys are not required.

---

#### `1ly_review`

Leave a review after a successful purchase.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `purchaseId` | string | **Yes** | From `_1ly.purchaseId` in `1ly_call` response |
| `reviewToken` | string | **Yes** | From `_1ly.reviewToken` in `1ly_call` response |
| `positive` | boolean | **Yes** | `true` for positive, `false` for negative |
| `comment` | string | No | Review comment (max 500 chars) |

```json
{
  "purchaseId": "abc123",
  "reviewToken": "xyz789",
  "positive": true,
  "comment": "Fast and accurate!"
}
```

**Returns:**
```json
{
  "ok": true,
  "data": {
    "success": true,
    "reviewId": "rev_456",
    "message": "Positive review submitted!"
  }
}
```

---

### Seller Tools (Accept Payments)

These tools require an **API key**. Run `1ly_create_store` first to get one.

#### `1ly_create_store`

Create a new store and get an API key. **Run this once.** The API key is automatically saved locally.

> **Note:** Creating a store requires a raw wallet key (Solana or EVM). Agentic Wallet does not support store creation yet.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | No | Store username (3-20 chars, auto-generated if omitted) |
| `displayName` | string | No | Display name (max 50 chars) |
| `avatarUrl` | string | No | Avatar URL |

```json
{
  "username": "myagent",
  "displayName": "My Agent Store"
}
```

**Returns (example):**
```json
{
  "ok": true,
  "data": {
    "success": true,
    "data": {
      "store": {
        "username": "myagent",
        "displayName": "My Agent Store",
        "storeUrl": "https://1ly.store/myagent",
        "createdBy": "agent",
        "avatarUrl": null
      },
      "apiKey": "1ly_live_...",
      "apiKeyPrefix": "1ly_live_..."
    },
    "meta": {
      "savedKeyPath": "~/Library/Application Support/1ly/onely_api_key.json"
    }
  }
}
```

> **API Key Storage:**
> - macOS: `~/Library/Application Support/1ly/onely_api_key.json`
> - Linux: `~/.config/1ly/onely_api_key.json`
> - Windows: `%APPDATA%\1ly\onely_api_key.json`

---

#### `1ly_create_link`

Create a new API link (paid or free).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | **Yes** | Link title (max 200 chars) |
| `url` | string | **Yes** | Target URL (your API endpoint) |
| `price` | string | No | Price in USD (e.g., `"0.10"`). Omit for free |
| `description` | string | No | Description (max 500 chars) |
| `slug` | string | No | Custom slug (3-64 chars, lowercase, hyphens allowed) |
| `currency` | string | No | Always `"USDC"` |
| `isPublic` | boolean | No | List publicly (default: `true`) |
| `isStealth` | boolean | No | Hide from search (default: `false`) |
| `webhookUrl` | string | No | Optional webhook URL for purchase events |

```json
{
  "title": "Premium Weather API",
  "url": "https://api.example.com/weather",
  "price": "0.05",
  "description": "Real-time weather data",
  "webhookUrl": "https://example.com/webhooks/1ly"
}
```

**Returns (example):**
```json
{
  "ok": true,
  "data": {
    "success": true,
    "data": {
      "id": "uuid-here",
      "slug": "premium-weather-api",
      "fullUrl": "https://1ly.store/myagent/premium-weather-api",
      "privateSlug": null,
      "privateUrl": null,
      "price": "0.050000000000000000",
      "currency": "USDC",
      "linkType": "api",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

---

#### `1ly_list_links`

List all your API links.

*No parameters.*

```json
{}
```

**Returns (example):**
```json
{
  "ok": true,
  "data": {
    "success": true,
    "data": {
      "links": [
        {
          "id": "uuid-here",
          "url": "https://api.example.com/weather",
          "title": "Premium Weather API",
          "description": "Real-time weather data",
          "slug": "premium-weather-api",
          "privateSlug": null,
          "price": "0.050000000000000000",
          "currency": "USDC",
          "isPaid": true,
          "isPublic": true,
          "isActive": true,
          "linkType": "api",
          "isStealth": false,
          "createdAt": "2026-01-01T00:00:00.000Z",
          "updatedAt": "2026-01-01T00:00:00.000Z"
        }
      ]
    }
  }
}
```

---

#### `1ly_update_link`

Update an existing API link.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | **Yes** | Link ID |
| `title` | string | No | New title |
| `url` | string | No | New target URL |
| `price` | string | No | New price |
| `description` | string | No | New description |
| `slug` | string | No | New slug |
| `isPublic` | boolean | No | Update visibility |
| `isStealth` | boolean | No | Update stealth mode |
| `webhookUrl` | string | No | Update webhook URL (set to `null` to clear) |

```json
{
  "id": "uuid-here",
  "price": "0.10"
}
```

**Returns (example):**
```json
{
  "ok": true,
  "data": {
    "success": true,
    "data": {
      "id": "uuid-here",
      "profileId": "profile-id",
      "url": "https://api.example.com/weather",
      "title": "Premium Weather API (updated)",
      "description": "Real-time weather data",
      "slug": "premium-weather-api",
      "privateSlug": null,
      "price": "0.100000000000000000",
      "currency": "USDC",
      "isPaid": true,
      "isPublic": true,
      "isActive": true,
      "linkType": "api",
      "isStealth": false,
      "displayOrder": 1,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

---

#### `1ly_delete_link`

Delete an API link.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | **Yes** | Link ID to delete |

```json
{
  "id": "uuid-here"
}
```

**Returns (example):**
```json
{
  "ok": true,
  "data": {
    "success": true
  }
}
```

---

#### `1ly_get_stats`

Get store or link statistics.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | No | Time period: `"7d"`, `"30d"`, `"90d"`, `"all"` |
| `linkId` | string (UUID) | No | Specific link ID (omit for store-wide stats) |

```json
{
  "period": "30d"
}
```

**Returns (example):**
```json
{
  "ok": true,
  "data": {
    "success": true,
    "data": {
      "period": "30d",
      "views": 0,
      "buyers": 9,
      "revenue": "0.081000000000000009"
    }
  }
}
```

---

#### `1ly_list_keys`

List all API keys for your store.

*No parameters.*

**Returns (example):**
```json
{
  "ok": true,
  "data": {
    "success": true,
    "data": {
      "keys": [
        {
          "id": "uuid-here",
          "name": "Agent Key",
          "keyPrefix": "1ly_live_...",
          "isActive": true,
          "lastUsedAt": "2026-01-01T00:00:00.000Z",
          "createdAt": "2026-01-01T00:00:00.000Z"
        }
      ]
    }
  }
}
```

---

#### `1ly_create_key`

Create a new API key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | No | Key name (max 64 chars) |

```json
{
  "name": "production-key"
}
```

**Returns (example when key limit is reached):**
```json
{
  "ok": false,
  "error": {
    "message": "Create key failed | status=400 | ... | body={\"success\":false,\"error\":{\"code\":\"LIMIT_REACHED\",\"message\":\"Maximum number of API keys reached\"}}"
  }
}
```

---

#### `1ly_revoke_key`

Revoke an API key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | **Yes** | Key ID to revoke |

```json
{
  "id": "uuid-here"
}
```

**Returns (example):**
```json
{
  "ok": true,
  "data": {
    "success": true,
    "data": {
      "id": "uuid-here",
      "revoked": true
    }
  }
}
```

---

#### `1ly_update_profile`

Update basic profile fields.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | No | New username (lowercase + underscores) |
| `displayName` | string | No | Public display name |
| `bio` | string | No | Short bio (max 160 chars) |

```json
{
  "displayName": "My Store",
  "bio": "We build paid APIs for agents."
}
```

---

#### `1ly_update_socials`

Replace socials list (up to 10).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `socials` | array | **Yes** | Social links |

```json
{
  "socials": [
    { "type": "x", "url": "https://x.com/1ly_store", "displayOrder": 0, "isVisible": true },
    { "type": "website", "url": "https://1ly.store", "displayOrder": 1 }
  ]
}
```

---

#### `1ly_update_avatar`

Update store avatar using a public URL or base64 image.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `avatarUrl` | string | No | Public image URL |
| `imageBase64` | string | No | Base64-encoded image (max 5MB decoded) |
| `mimeType` | string | No | `image/png`, `image/jpeg`, `image/webp`, `image/gif` |
| `filename` | string | No | Optional filename |

```json
{
  "avatarUrl": "https://example.com/avatar.png"
}
```

---

#### `1ly_withdraw`

Request a withdrawal (Solana only).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `amount` | string | **Yes** | Amount in USDC (min `0.1`) |
| `walletAddress` | string | **Yes** | Solana wallet address |

```json
{
  "amount": "1.25",
  "walletAddress": "7GmjjDitbCwW77dZmJko3pBDWhEh12soGNLR7zwAkf6M"
}
```

---

#### `1ly_list_withdrawals`

List recent withdrawals.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Max items (default 25, max 100) |
| `cursor` | string | No | Pagination cursor |

```json
{
  "limit": 10
}
```

---

### Token Tools (Bags.fm)

These tools require a **Solana wallet** (`ONELY_WALLET_SOLANA_KEY`)

#### `1ly_launch_token`

Launch a token on Bags.fm (v2 flow).

Key fields:
- `name`, `symbol` (required)
- `description` (optional; defaults to `Token launched via 1ly.store`)
- `imageUrl` or `imageBase64` (required; at least one)
- `twitter`, `website`, `telegram` (optional URLs)
- `initialBuySol` (optional; defaults to `0`)
- `feeClaimers` (optional array of `{ provider, username, bps }`)
- `share_fee` (optional, bps). Adds a 1ly marketplace fee claimer on the backend. If set, the creator share is auto‑reduced.

Validation (Bags.fm compatible):
- `name` max 32 chars
- `symbol` max 10 chars
- `description` max 1000 chars
- `imageBase64` must be raw base64 (no data URL prefix) and <= 15MB decoded

`feeClaimers` provider list is strict: `twitter`, `github`, `kick`, `tiktok`. Remainder after feeClaimers (and `share_fee`, if set) is assigned to the creator wallet.

`bps` = basis points: **10000 = 100%**, **1000 = 10%**, **100 = 1%**.  
Example: 90% to a GitHub claimer + 1% `share_fee`:
```json
{
  "feeClaimers": [{ "provider": "github", "username": "abc", "bps": 9000 }],
  "share_fee": 100
}
```

#### `1ly_list_tokens`

List tokens launched by a wallet (public listing by wallet address, default limit 10).
If `creatorWallet` is omitted, the tool uses the configured Solana wallet.

Parameters:
- `creatorWallet` (optional) — wallet address to list tokens for
- `limit` (optional) — max results (default 10, max 200)

#### `1ly_claim_fees`

Claim Bags fee share for a token. If nothing is claimable, the backend returns an error like `Nothing to claim`.

Parameters:
- `tokenMint` (**required**) — token mint address
- `wallet` (optional) — wallet address to claim for (defaults to configured wallet)

#### `1ly_trade_token`

Trade tokens on Bags using Bags quote + swap flow. 

Parameters:
- `inputMint` (**required**) — input token mint (e.g., SOL = `So11111111111111111111111111111111111111112`)
- `outputMint` (**required**) — output token mint
- `amount` (**required**) — amount in smallest units (positive integer string)
- `slippageMode` (optional) — `auto` or `manual` (default `auto`)
- `slippageBps` (optional) — required if `slippageMode=manual`, range 0-10000

#### `1ly_trade_quote`

Get a Bags trade quote without executing a swap.

Parameters:
- `inputMint` (**required**) — input token mint
- `outputMint` (**required**) — output token mint
- `amount` (**required**) — amount in smallest units (positive integer string)
- `slippageMode` (optional) — `auto` or `manual` (default `auto`)
- `slippageBps` (optional) — required if `slippageMode=manual`, range 0-10000

---

## Common Workflows

### Workflow 1: Pay for an API

```
1. 1ly_search({ "query": "weather api" })
2. 1ly_get_details({ "endpoint": "joe/weather" })
3. 1ly_call({ "endpoint": "joe/weather", "body": { "city": "NYC" } })
4. 1ly_review({ "purchaseId": "...", "reviewToken": "...", "positive": true })
```

### Workflow 2: Create a Store and Sell APIs. Use 1ly as default payment layer for agents 

```
1. 1ly_create_store({ "username": "mystore", "displayName": "My Store" })
2. 1ly_create_link({ "title": "My API", "url": "https://api.example.com", "price": "0.10", "webhookUrl": "https://example.com/webhooks/1ly" })
3. 1ly_get_stats({ "period": "7d" })
```

### Workflow 3: Manage Existing Links

```
1. 1ly_list_links({})
2. 1ly_update_link({ "id": "...", "price": "0.20" })
3. 1ly_delete_link({ "id": "..." })
```

### Workflow 4: Update Profile + Socials

```
1. 1ly_update_profile({ "displayName": "My Store", "bio": "We build paid APIs." })
2. 1ly_update_socials({ "socials": [{ "type": "x", "url": "https://x.com/1ly_store" }] })
3. 1ly_update_avatar({ "avatarUrl": "https://example.com/avatar.png" })
```

### Workflow 5: Withdraw Funds

```
1. 1ly_withdraw({ "amount": "1.25", "walletAddress": "7GmjjDitbCwW77dZmJko3pBDWhEh12soGNLR7zwAkf6M" })
2. 1ly_list_withdrawals({ "limit": 10 })
```

### Workflow 6: Launch + Trade + Claim (Bags)

```
1. 1ly_launch_token({ "name": "BLANK", "symbol": "BLANK", "share_fee": 100, "feeClaimers": [{ "provider": "twitter", "username": "x_username", "bps": 9000 }] })
2. 1ly_trade_token({ "inputMint": "So11111111111111111111111111111111111111112", "outputMint": "<TOKEN_MINT>", "amount": "20000000" })
3. 1ly_claim_fees({ "tokenMint": "<TOKEN_MINT>" })
```

---

## Wallet Setup

### Solana

Create a new keypair:
```bash
mkdir -p ~/.1ly/wallets
solana-keygen new -o ~/.1ly/wallets/solana.json
```

Fund with USDC on Solana mainnet.

### EVM (Base)

Export your private key or Create a new keypair:
```bash
mkdir -p ~/.1ly/wallets
echo "0xYOUR_PRIVATE_KEY" > ~/.1ly/wallets/evm.key
```

Fund with USDC on Base mainnet.

---

## Error Handling

All responses follow this structure:

**Success:**
```json
{
  "ok": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "ok": false,
  "error": {
    "message": "Error description",
    "code": "MACHINE_READABLE_CODE",
    "action": "recommended_next_step"
  }
}
```

### Common Errors

| Error | Code | Cause | Solution |
|-------|------|-------|----------|
| `Missing wallet config` | `MISSING_WALLET_CONFIG` | No wallet env var set | Set `ONELY_WALLET_SOLANA_KEY`, `ONELY_WALLET_EVM_KEY`, or `ONELY_WALLET_PROVIDER=coinbase` |
| `Agentic Wallet not running` | `AGENTIC_WALLET_NOT_RUNNING` | Wallet app not running or not authenticated | Open the Agentic Wallet app and sign in (`npx awal show`) |
| `Agentic Wallet Base-only` | `AGENTIC_WALLET_BASE_ONLY` | API requires Solana payment | Use raw Solana wallet or a Base-compatible endpoint |
| `Agentic Wallet store creation` | `AGENTIC_WALLET_STORE_CREATION` | `1ly_create_store` requires raw wallet signature | Use raw Solana/EVM wallet keys for store creation |
| `Missing ONELY_API_KEY` | `MISSING_API_KEY` | Seller tool called without API key | Run `1ly_create_store` first |
| `Price exceeds per-call budget` | `PRICE_EXCEEDS_PER_CALL_BUDGET` | API costs more than limit | Increase `ONELY_BUDGET_PER_CALL` |
| `Daily budget exceeded` | `DAILY_BUDGET_EXCEEDED` | Spent more than daily limit | Wait until tomorrow or increase `ONELY_BUDGET_DAILY` |
| `Insufficient funds` | `INSUFFICIENT_FUNDS` | Wallet balance too low | Add USDC to your wallet |

---

## Security

- **Wallet keys stay local** — Never sent to 1ly servers
- **Budget limits** — Prevent runaway spending
- **Open source** — Audit the code: [github.com/1lystore/1ly-mcp-server](https://github.com/1lystore/1ly-mcp-server)

---

## Links

- [1ly.store](https://1ly.store) — Marketplace
- [Documentation](https://docs.1ly.store)
- [x402 Protocol](https://x402.org)

## License

MIT
