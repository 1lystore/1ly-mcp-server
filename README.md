# @1ly/mcp-server

MCP server for [1ly.store](https://1ly.store) — Enable AI agents to discover, pay for, and sell APIs using crypto.

## Overview

This MCP server gives AI agents the ability to:

- **Buy** — Search, discover, and pay for APIs, resources with automatic crypto payments (x402 protocol)
- **Sell** — Create a store, list paid API endpoints or resources, and accept payments

**Supported Networks:** Solana (mainnet), Base (mainnet)  
**Payment Currency:** USDC

## What is this?
This MCP server enables AI agents (Claude, GPT, Cursor, or any AI Agents etc.) to:

Create store on 1ly.store 
Accept payments for your own APIs/resources using 1ly as the payment layer
Create paid links that any x402‑compatible agent can call and pay automatically
Paid links are listed on the 1ly marketplace by default for instant agent discovery
Search for APIs and services on 1ly.store
Get details about pricing, reviews, and usage
Call paid APIs with automatic crypto payments (x402 protocol) in secure way.
Leave reviews after purchases, optional but recommended to make better experience for 1ly users

---

## Quick Start

### 1. Install and Run

```bash
# Solana wallet
ONELY_WALLET_SOLANA_KEY="/path/to/solana-wallet.json" npx @1ly/mcp-server

# OR Base/EVM wallet
ONELY_WALLET_EVM_KEY="/path/to/evm.key" npx @1ly/mcp-server

# OR both wallets
ONELY_WALLET_SOLANA_KEY="/path/to/solana-wallet.json" \
ONELY_WALLET_EVM_KEY="/path/to/evm.key" \
npx @1ly/mcp-server
```

### 2. Verify Setup

```bash
ONELY_WALLET_SOLANA_KEY="/path/to/solana-wallet.json" npx @1ly/mcp-server --self-test
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONELY_WALLET_SOLANA_KEY` | Yes* | Path to Solana keypair JSON file, or inline JSON array |
| `ONELY_WALLET_EVM_KEY` | Yes* | Path to EVM private key file, or inline hex key (with or without `0x`) |
| `ONELY_API_KEY` | No | API key for seller tools. Auto-loaded after `1ly_create_store` |
| `ONELY_BUDGET_PER_CALL` | No | Max USD per API call (default: `1.00`) |
| `ONELY_BUDGET_DAILY` | No | Daily USD spending limit (default: `50.00`) |
| `ONELY_BUDGET_STATE_FILE` | No | Path to local budget state file (default: `~/.1ly-mcp-budget.json`) |
| `ONELY_NETWORK` | No | Preferred network: `solana` or `base` (default: `solana`) |
| `ONELY_API_BASE` | No | API base URL (default: `https://1ly.store`) |

*At least one wallet is required for payments.

### Claude Desktop Configuration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "1ly": {
      "command": "npx",
      "args": ["@1ly/mcp-server"],
      "env": {
        "ONELY_WALLET_SOLANA_KEY": "/absolute/path/to/solana-wallet.json",
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
        "ONELY_WALLET_EVM_KEY": "/absolute/path/to/evm.key",
        "ONELY_BUDGET_PER_CALL": "1.00",
        "ONELY_BUDGET_DAILY": "50.00"
      }
    }
  }
}
```
</details>

<details>
<summary>Both Solana + Base wallets</summary>

```json
{
  "mcpServers": {
    "1ly": {
      "command": "npx",
      "args": ["@1ly/mcp-server"],
      "env": {
        "ONELY_WALLET_SOLANA_KEY": "/absolute/path/to/solana-wallet.json",
        "ONELY_WALLET_EVM_KEY": "/absolute/path/to/evm.key",
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

### Buyer Tools (Pay for APIs)

These tools require a **wallet** configured.

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

```json
{
  "title": "Premium Weather API",
  "url": "https://api.example.com/weather",
  "price": "0.05",
  "description": "Real-time weather data"
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
2. 1ly_create_link({ "title": "My API", "url": "https://api.example.com", "price": "0.10" })
3. 1ly_get_stats({ "period": "7d" })
```

### Workflow 3: Manage Existing Links

```
1. 1ly_list_links({})
2. 1ly_update_link({ "id": "...", "price": "0.20" })
3. 1ly_delete_link({ "id": "..." })
```

---

## Wallet Setup

### Solana

Create a new keypair:
```bash
solana-keygen new -o ./wallets/solana.json
```

Fund with USDC on Solana mainnet.

### EVM (Base)

Export your private key from MetaMask/Rabby and save to a file:
```bash
echo "0xYOUR_PRIVATE_KEY" > ./wallets/evm.key
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
  "error": { "message": "Error description" }
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Missing wallet config` | No wallet env var set | Set `ONELY_WALLET_SOLANA_KEY` or `ONELY_WALLET_EVM_KEY` |
| `Missing ONELY_API_KEY` | Seller tool called without API key | Run `1ly_create_store` first |
| `Price exceeds per-call budget` | API costs more than limit | Increase `ONELY_BUDGET_PER_CALL` |
| `Daily budget exceeded` | Spent more than daily limit | Wait until tomorrow or increase `ONELY_BUDGET_DAILY` |
| `Insufficient funds` | Wallet balance too low | Add USDC to your wallet |

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
