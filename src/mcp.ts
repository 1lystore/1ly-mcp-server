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
