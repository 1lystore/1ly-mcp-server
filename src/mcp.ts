import type { ErrorMapping, McpErrorAction, McpErrorCode } from "./error-codes.js";

type McpTextContent = { type: "text"; text: string };

export class McpToolError extends Error {
  code?: McpErrorCode;
  action?: McpErrorAction;
  meta?: Record<string, unknown>;

  constructor(
    message: string,
    options?: { code?: McpErrorCode; action?: McpErrorAction; meta?: Record<string, unknown> }
  ) {
    super(message);
    this.name = "McpToolError";
    this.code = options?.code;
    this.action = options?.action;
    this.meta = options?.meta;
  }
}

export function mcpJson(ok: boolean, payload: Record<string, unknown>, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ ok, ...payload }, null, 2),
      } satisfies McpTextContent,
    ],
    ...(isError ? { isError: true as const } : {}),
  };
}

export function mcpOk(data: unknown, meta?: Record<string, unknown>) {
  return mcpJson(true, { data, ...(meta ? { meta } : {}) });
}

export function mcpError(
  message: string,
  metaOrOptions?:
    | Record<string, unknown>
    | { meta?: Record<string, unknown>; code?: McpErrorCode; action?: McpErrorAction }
) {
  let meta: Record<string, unknown> | undefined;
  let code: McpErrorCode | undefined;
  let action: McpErrorAction | undefined;

  if (
    metaOrOptions &&
    (Object.prototype.hasOwnProperty.call(metaOrOptions, "meta") ||
      Object.prototype.hasOwnProperty.call(metaOrOptions, "code") ||
      Object.prototype.hasOwnProperty.call(metaOrOptions, "action"))
  ) {
    const options = metaOrOptions as {
      meta?: Record<string, unknown>;
      code?: McpErrorCode;
      action?: McpErrorAction;
    };
    meta = options.meta;
    code = options.code;
    action = options.action;
  } else {
    meta = metaOrOptions as Record<string, unknown> | undefined;
  }

  return mcpJson(
    false,
    {
      error: {
        message,
        ...(code ? { code } : {}),
        ...(action ? { action } : {}),
      },
      ...(meta ? { meta } : {}),
    },
    true
  );
}

/**
 * VAULT_OFFLINE error contract per PRD
 *
 * Used when the DCP vault is not connected (relay unreachable or vault offline).
 * Indicates that free tools (1ly_search, 1ly_get_details, 1ly_trade_quote) still work.
 */
export function mcpVaultOffline(message?: string) {
  return mcpJson(
    false,
    {
      error: {
        code: "VAULT_OFFLINE" as McpErrorCode,
        message: message || "Your DCP vault is not connected. Open your DCP app to reconnect.",
        action: "open_dcp_app" as McpErrorAction,
        free_tools_available: true,
      },
    },
    true
  );
}
