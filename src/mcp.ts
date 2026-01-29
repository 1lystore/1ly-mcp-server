type McpTextContent = { type: "text"; text: string };

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

export function mcpError(message: string, meta?: Record<string, unknown>) {
  return mcpJson(false, { error: { message }, ...(meta ? { meta } : {}) }, true);
}

