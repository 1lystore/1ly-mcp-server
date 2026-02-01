# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2] - 2026-02-01

### Added
- Dual-wallet support (Solana + Base) via `ONELY_WALLET_SOLANA_KEY` and `ONELY_WALLET_EVM_KEY`.
- Changelog for release tracking.

### Changed
- README updated to reflect new wallet env vars and real tool payloads.

### Fixed
- More robust x402 payment handling (non-JSON 402 responses, header fallbacks).
- Budget tracking safety checks to avoid invalid state persistence.
