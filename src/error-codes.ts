export type McpErrorCode =
  | "MISSING_API_KEY"
  | "MISSING_WALLET_CONFIG"
  | "WALLET_FILE_NOT_FOUND"
  | "INVALID_WALLET_FORMAT"
  | "INVALID_WALLET_PATH"
  | "AGENTIC_WALLET_NOT_RUNNING"
  | "AGENTIC_WALLET_BASE_ONLY"
  | "AGENTIC_WALLET_STORE_CREATION"
  | "AGENTIC_WALLET_TIMEOUT"
  | "AGENTIC_WALLET_RESPONSE_INVALID"
  | "RATE_LIMIT_EXCEEDED"
  | "PRICE_EXCEEDS_PER_CALL_BUDGET"
  | "DAILY_BUDGET_EXCEEDED"
  | "INSUFFICIENT_FUNDS"
  | "MISSING_SLIPPAGE_BPS"
  | "INVALID_SLIPPAGE_BPS"
  | "INVALID_IMAGE_BASE64"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_TOO_SMALL"
  | "PAYMENT_FAILED"
  | "PAYMENT_REQUIREMENTS_MISSING"
  | "INVALID_PAYMENT_AMOUNT"
  | "INVALID_INPUT"
  | "TX_UNCERTAIN"
  | "UNKNOWN_ERROR";

export type McpErrorAction =
  | "run_create_store_or_set_onely_api_key"
  | "set_wallet_env"
  | "check_wallet_path"
  | "use_valid_wallet_format"
  | "use_home_or_tmp_path"
  | "start_agentic_wallet"
  | "use_evm_or_raw_solana"
  | "use_raw_wallet_keys"
  | "restart_agentic_wallet"
  | "reduce_request_rate"
  | "increase_per_call_budget"
  | "increase_daily_budget_or_wait"
  | "fund_wallet"
  | "set_slippage_bps"
  | "set_slippage_bps_0_10000"
  | "provide_valid_base64"
  | "reduce_image_size"
  | "use_valid_image"
  | "verify_funds_and_retry"
  | "retry_or_contact_support"
  | "fix_request"
  | "verify_on_chain_before_retry";

export type ErrorMapping = {
  code: McpErrorCode;
  action?: McpErrorAction;
};

export function mapErrorToCode(message: string): ErrorMapping {
  const msg = message.toLowerCase();

  if (msg.includes("missing onely_api_key")) {
    return { code: "MISSING_API_KEY", action: "run_create_store_or_set_onely_api_key" };
  }
  if (msg.includes("missing wallet config")) {
    return { code: "MISSING_WALLET_CONFIG", action: "set_wallet_env" };
  }
  if (msg.includes("solana wallet not configured") || msg.includes("evm wallet not configured")) {
    return { code: "MISSING_WALLET_CONFIG", action: "set_wallet_env" };
  }
  if (msg.includes("wallet key file not found") || msg.includes("evm wallet key file not found")) {
    return { code: "WALLET_FILE_NOT_FOUND", action: "check_wallet_path" };
  }
  if (msg.includes("invalid wallet file format")) {
    return { code: "INVALID_WALLET_FORMAT", action: "use_valid_wallet_format" };
  }
  if (msg.includes("wallet file must be in home directory") || msg.includes("invalid wallet file path")) {
    return { code: "INVALID_WALLET_PATH", action: "use_home_or_tmp_path" };
  }
  if (msg.includes("agentic wallet") && msg.includes("not running")) {
    return { code: "AGENTIC_WALLET_NOT_RUNNING", action: "start_agentic_wallet" };
  }
  if (msg.includes("agentic wallet ipc timeout")) {
    return { code: "AGENTIC_WALLET_TIMEOUT", action: "restart_agentic_wallet" };
  }
  if (msg.includes("agentic wallet ipc returned empty result")) {
    return { code: "AGENTIC_WALLET_RESPONSE_INVALID", action: "restart_agentic_wallet" };
  }
  if (msg.includes("agentic wallet returned an invalid address")) {
    return { code: "AGENTIC_WALLET_RESPONSE_INVALID", action: "restart_agentic_wallet" };
  }
  if (msg.includes("agentic wallet only supports base")) {
    return { code: "AGENTIC_WALLET_BASE_ONLY", action: "use_evm_or_raw_solana" };
  }
  if (msg.includes("agentic wallet does not support store creation")) {
    return { code: "AGENTIC_WALLET_STORE_CREATION", action: "use_raw_wallet_keys" };
  }
  if (msg.includes("rate limit exceeded")) {
    return { code: "RATE_LIMIT_EXCEEDED", action: "reduce_request_rate" };
  }
  if (msg.includes("exceeds per-call budget")) {
    return { code: "PRICE_EXCEEDS_PER_CALL_BUDGET", action: "increase_per_call_budget" };
  }
  if (msg.includes("daily budget") && msg.includes("exceed")) {
    return { code: "DAILY_BUDGET_EXCEEDED", action: "increase_daily_budget_or_wait" };
  }
  if (msg.includes("insufficient funds")) {
    return { code: "INSUFFICIENT_FUNDS", action: "fund_wallet" };
  }
  if (msg.includes("missing slippagebps")) {
    return { code: "MISSING_SLIPPAGE_BPS", action: "set_slippage_bps" };
  }
  if (msg.includes("slippage") && msg.includes("range")) {
    return { code: "INVALID_SLIPPAGE_BPS", action: "set_slippage_bps_0_10000" };
  }
  if (msg.includes("invalid imagebase64")) {
    return { code: "INVALID_IMAGE_BASE64", action: "provide_valid_base64" };
  }
  if (msg.includes("imagebase64 exceeds")) {
    return { code: "IMAGE_TOO_LARGE", action: "reduce_image_size" };
  }
  if (msg.includes("image too small")) {
    return { code: "IMAGE_TOO_SMALL", action: "use_valid_image" };
  }
  if (msg.includes("payment failed")) {
    return { code: "PAYMENT_FAILED", action: "verify_funds_and_retry" };
  }
  if (msg.includes("402 response missing payment requirements")) {
    return { code: "PAYMENT_REQUIREMENTS_MISSING", action: "retry_or_contact_support" };
  }
  if (msg.includes("invalid or missing payment amount")) {
    return { code: "INVALID_PAYMENT_AMOUNT", action: "retry_or_contact_support" };
  }
  if (
    msg.includes("expected") ||
    msg.includes("required") ||
    msg.includes("unrecognized") ||
    msg.includes("invalid_type") ||
    msg.includes("invalid input")
  ) {
    return { code: "INVALID_INPUT", action: "fix_request" };
  }

  return { code: "UNKNOWN_ERROR" };
}
