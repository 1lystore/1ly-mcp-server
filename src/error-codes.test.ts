import { describe, expect, it } from "vitest";
import { mapErrorToCode } from "./error-codes.js";

describe("mapErrorToCode", () => {
  it("maps common wallet config errors", () => {
    expect(mapErrorToCode("Missing wallet config: set ONELY_WALLET_SOLANA_KEY").code).toBe(
      "MISSING_WALLET_CONFIG"
    );
  });

  it("maps API key errors", () => {
    expect(mapErrorToCode("Missing ONELY_API_KEY for create link").code).toBe("MISSING_API_KEY");
  });

  it("maps budget errors", () => {
    expect(mapErrorToCode("Price $2 exceeds per-call budget limit").code).toBe(
      "PRICE_EXCEEDS_PER_CALL_BUDGET"
    );
    expect(mapErrorToCode("would exceed daily budget of $50").code).toBe("DAILY_BUDGET_EXCEEDED");
  });

  it("falls back to UNKNOWN_ERROR", () => {
    expect(mapErrorToCode("Some random failure").code).toBe("UNKNOWN_ERROR");
  });
});
