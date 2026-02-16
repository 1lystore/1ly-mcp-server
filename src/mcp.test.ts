import { describe, expect, it } from "vitest";
import { McpToolError, mcpError } from "./mcp.js";

describe("mcpError", () => {
  it("includes code and action when provided", () => {
    const err = new McpToolError("Test", { code: "TX_UNCERTAIN", action: "verify_on_chain_before_retry" });
    const res = mcpError(err.message, { code: err.code, action: err.action });
    const text = (res.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as { ok: boolean; error: { code?: string; action?: string } };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("TX_UNCERTAIN");
    expect(parsed.error.action).toBe("verify_on_chain_before_retry");
  });
});
