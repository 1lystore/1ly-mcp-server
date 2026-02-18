# Changelog

All notable changes to this project will be documented in this file.

## [0.1.7] - 2026-02-19

### 📋 Registry
- Published to official MCP Registry (`registry.modelcontextprotocol.io`) as `io.github.1lystore/mcp-server`
- Added `server.json` with full environment variable metadata for all 11 config options
- Added `mcpName` to `package.json` for registry namespace verification

### 📝 Documentation
- Added `$1LY` as supported payment currency alongside USDC (Solana only)
- Fixed Claude Desktop config examples to use absolute paths — `~` is not expanded in JSON configs
- Added `ONELY_SOLANA_DRY_RUN` to environment variables table
- Added UI path for getting API key: Settings → Developer Mode on 1ly.store (no wallet needed)

### ⚠️ BREAKING CHANGES
**None** — fully backward compatible.

---

## [0.1.6] - 2026-02-16

### ✨ Features
- Bags.fm token launch + trade tools (launch, trade, trade quote, list tokens, claim fees)
- Structured MCP error codes + actions for agent-friendly handling

### 🛡️ Validation / Reliability
- Bags-compatible input validation (name/symbol/description limits, base64 size cap, slippage range)
- Retry policy tuned for Bags flows (no retry on state-creating create-token call)
- “Uncertain” on-chain error classification for safe retries

### 🧪 Tests
- Added error code mapping tests
- Added MCP error shape tests

### 📝 Documentation
- Added Bags validation details in README
- Documented structured error codes in README

### ⚠️ BREAKING CHANGES
**None** - This release is backward compatible (error fields added, not removed).

---

## [0.1.5] - 2026-02-14

### ✨ Features
- Coinbase Agentic Wallet support (Base-only) via CLI/IPC bridge
- Optional wallet provider selection with `ONELY_WALLET_PROVIDER=coinbase`
- Tilde (`~/`) expansion for wallet paths and budget state file

### 📝 Documentation
- Quick Start updated with Agentic Wallet setup
- Clear wallet path restrictions added

### ⚠️ BREAKING CHANGES
**None** - This release is fully backward compatible

---

## [0.1.4] - 2026-02-14

### 🚨 SECURITY FIXES (CRITICAL UPDATE)

#### HIGH Severity
- **CRITICAL**: Upgraded `@modelcontextprotocol/sdk` to v1.26.0 (fixes HIGH severity data leak vulnerability CVE-2024-XXXX)
- Fixed SSRF (Server-Side Request Forgery) vulnerability - now only allows `https://1ly.store` or `http://localhost:*`
- Fixed path traversal vulnerability in wallet file loading - wallet files must be in home directory or /tmp
- Fixed memory exhaustion DoS via base64 image uploads - added 5MB limit and strict MIME validation

#### MEDIUM Severity
- Fixed budget bypass vulnerability via invalid parseFloat values (NaN, negative numbers)
- Fixed budget state file permissions - now uses chmod 600 (owner-only access)
- Added rate limiting protection - 100 requests per minute maximum
- Added sensitive data redaction in error messages (API keys, tokens, wallet addresses)

### ✨ Features
- Security audit logging for all security events (budget exceeded, rate limit, path violations, etc.)
- Comprehensive input validation with detailed error messages
- Enhanced security logging to stderr for audit trails

### 📝 Documentation
- Added `SECURITY_PATCH_0.1.4.md` with comprehensive security patch documentation
- Updated PRD documentation to reflect security improvements

### ⚠️ BREAKING CHANGES
**None** - This release is fully backward compatible

### 🔒 Security
**All users must upgrade immediately** due to HIGH severity dependency vulnerability.

**Migration Notes**:
- No configuration changes required for standard setups
- Custom `ONELY_API_BASE` (if set) must be `https://1ly.store` or `http://localhost:PORT`
- Wallet files must be in home directory (already the default)
- Avatar uploads now limited to 5MB (previously unlimited)

---

## [0.1.2] - 2026-02-01

### Added
- Dual-wallet support (Solana + Base) via `ONELY_WALLET_SOLANA_KEY` and `ONELY_WALLET_EVM_KEY`.
- Changelog for release tracking.

### Changed
- README updated to reflect new wallet env vars and real tool payloads.

### Fixed
- More robust x402 payment handling (non-JSON 402 responses, header fallbacks).
- Budget tracking safety checks to avoid invalid state persistence.
