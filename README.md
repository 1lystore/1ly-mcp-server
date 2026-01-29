# @1ly/mcp-server

MCP server for [1ly.store](https://1ly.store) — Discover and pay for APIs with AI agents.

## What is this?

This MCP server enables AI agents (Claude, GPT, Cursor, etc.) to:

1. **Search** for APIs and services on 1ly.store
2. **Get details** about pricing, reviews, and usage
3. **Call APIs** with automatic crypto payments (x402 protocol)
4. **Leave reviews** after purchases
5. **Create and manage API links** (Developer Mode + API key)

## Quick Start (1 minute)

Pick **one** of the following and paste it into your terminal.

### Solana (mainnet)

```bash
ONELY_WALLET_TYPE=solana \
ONELY_WALLET_KEY="$HOME/1ly-agent-wallet.json" \
npx @1ly/mcp-server
```

### Base (mainnet)

```bash
ONELY_WALLET_TYPE=evm \
ONELY_WALLET_KEY="$HOME/.1ly-base-private-key" \
npx @1ly/mcp-server
```

Optional safety limits:

```bash
ONELY_BUDGET_PER_CALL=1.00
ONELY_BUDGET_DAILY=50.00
```

### Developer Mode (create/manage API links)

```bash
ONELY_API_KEY="1ly_live_..." \
npx @1ly/mcp-server
```

## Get an API Key (Developer Mode)

1. Sign in to 1ly store: `https://1ly.store`
2. Open **Settings** (profile dropdown → Settings)
3. Enable **Developer Mode**
4. Open **Developer Settings** and click **Create API Key**
5. Copy the key (shown once)

Keys look like:
```
1ly_live_xxxxxxxx...
```

## How API keys are used

- **For MCP tools**: set `ONELY_API_KEY` in your MCP config or environment.  
  The MCP server attaches it as `Authorization: Bearer <key>` automatically.
- **For direct API calls**: include the header yourself:

```http
Authorization: Bearer 1ly_live_...
```

## Install (Claude Desktop)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "1ly": {
      "command": "npx",
      "args": ["@1ly/mcp-server"],
      "env": {
        "ONELY_WALLET_TYPE": "solana",
        "ONELY_WALLET_KEY": "/path/to/solana-wallet.json",
        "ONELY_BUDGET_PER_CALL": "1.00",
        "ONELY_BUDGET_DAILY": "50.00"
      }
    }
  }
}
```

### Developer Mode (API key only)

```json
{
  "mcpServers": {
    "1ly": {
      "command": "npx",
      "args": ["@1ly/mcp-server"],
      "env": {
        "ONELY_API_KEY": "1ly_live_..."
      }
    }
  }
}
```

## Install (Cursor)

Add to `.cursor/mcp.json`:

```json
{
  "servers": {
    "1ly": {
      "command": "npx @1ly/mcp-server",
      "env": {
        "ONELY_WALLET_TYPE": "solana",
        "ONELY_WALLET_KEY": "/path/to/solana-wallet.json",
        "ONELY_BUDGET_PER_CALL": "1.00",
        "ONELY_BUDGET_DAILY": "50.00"
      }
    }
  }
}
```

### Developer Mode (API key only)

```json
{
  "servers": {
    "1ly": {
      "command": "npx @1ly/mcp-server",
      "env": {
        "ONELY_API_KEY": "1ly_live_..."
      }
    }
  }
}
```

## Verify it works (recommended)

Run a quick self-test:

```bash
ONELY_WALLET_TYPE=solana \
ONELY_WALLET_KEY="$HOME/1ly-agent-wallet.json" \
npx @1ly/mcp-server --self-test
```

## What agents can do

Typical flow:

1. `1ly_search` → find an API
2. `1ly_get_details` → confirm price + supported networks
3. `1ly_call` → auto‑pay with x402 v2 and return the API response
4. `1ly_review` → optional review using the `_1ly` metadata
5. `1ly_create_link` → create a paid or free API link (Developer Mode)

## Tools

### `1ly_search`

Search for APIs by keyword.

```typescript
// Input
{ query: "weather api", type: "api", maxPrice: 0.10 }

// Output
{
  results: [
    {
      title: "Real-time Weather",
      endpoint: "/api/link/joe/weather",
      price: 0.01,
      stats: { buyers: 150, rating: 95 }
    }
  ]
}
```

### `1ly_get_details`

Get full details about an API.

```typescript
// Input
{ endpoint: "joe/weather" }

// Output
{
  title: "Real-time Weather",
  description: "Global weather data with forecasts",
  price: 0.01,
  reviews: [...],
  paymentInfo: { networks: ["solana", "base"] }
}
```

### `1ly_call`

Call an API with automatic payment.

```typescript
// Input
{ endpoint: "joe/weather", body: { city: "NYC" } }

// Output
{
  data: { temp: 72, conditions: "sunny" },
  _1ly: { purchaseId: "...", reviewToken: "..." }
}
```

### `1ly_review`

Leave a review after purchase.

```typescript
// Input
{ purchaseId: "...", reviewToken: "...", positive: true, comment: "Fast and accurate!" }

// Output
{ success: true, reviewId: "..." }
```

### `1ly_create_link`

Create an API link (paid or free). Requires `ONELY_API_KEY`.

```typescript
// Input
{
  title: "Premium Trading Signals",
  url: "https://example.com/signals",
  price: "10.00",
  description: "Daily crypto signals"
}
```

### `1ly_list_links`

List API links for the store. Requires `ONELY_API_KEY`.

### `1ly_update_link`

Update an API link by id. Requires `ONELY_API_KEY`.

### `1ly_delete_link`

Delete an API link by id. Requires `ONELY_API_KEY`.

### `1ly_get_stats`

Fetch store or link stats. Requires `ONELY_API_KEY`.

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `ONELY_WALLET_TYPE` | Yes | `solana` or `evm` |
| `ONELY_WALLET_KEY` | Yes | Private key or path to keyfile |
| `ONELY_BUDGET_PER_CALL` | No | Max USD per call (default: 1.00) |
| `ONELY_BUDGET_DAILY` | No | Daily USD limit (default: 50.00) |
| `ONELY_NETWORK` | No | Preferred network (default: solana) |
| `ONELY_API_KEY` | No | Developer Mode API key for link management |

## Wallet Setup

### Solana

Create a wallet keypair:

```bash
solana-keygen new -o ~/1ly-agent-wallet.json
```

Fund it with USDC on Solana mainnet.

### EVM (Base)

Create an EVM wallet (Base-compatible) and provide its **private key** via `ONELY_WALLET_KEY`.

- **Option A (recommended)**: export your private key from your wallet (e.g. MetaMask/Rabby) and save it to a local file (one line, with or without `0x` prefix).
- **Option B**: set the private key directly as an env var (not recommended for shared machines).

Examples:

```bash
# from a file
export ONELY_WALLET_TYPE=evm
export ONELY_WALLET_KEY="$HOME/.1ly-base-private-key"

# or inline (starts with 0x...)
export ONELY_WALLET_TYPE=evm
export ONELY_WALLET_KEY="0xYOUR_PRIVATE_KEY"
```

## Devnet / testnets (coming soon)

We plan to offer an official devnet/testnet endpoint so you can try 1ly with test USDC before mainnet. For now, production usage requires mainnet USDC.

## Troubleshooting

- **Missing wallet**: Set `ONELY_WALLET_TYPE` and `ONELY_WALLET_KEY`.
- **Missing API key**: Set `ONELY_API_KEY` to use link management tools.
- **402 errors on first call**: Expected — `1ly_call` handles payment automatically.
- **Insufficient funds**: Fund your wallet with USDC on the selected network.
- **Review failed**: Ensure you pass the exact `purchaseId` + `reviewToken` returned by `1ly_call`.

## Security

- **Wallet keys stay local** — Never sent to 1ly servers
- **Budget limits** — Prevent runaway spending
- **Open source** — Audit the code yourself

## Links

- [1ly.store](https://1ly.store) — Marketplace
- [Documentation](https://docs.1ly.store)
- [x402 Protocol](https://x402.org)

## License

MIT
