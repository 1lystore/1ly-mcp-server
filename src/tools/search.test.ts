import { describe, expect, it } from "vitest";
import type { Config } from "../config.js";
import { handleSearch } from "./search.js";

const config: Config = {
  apiBase: "https://1ly.store",
  wallet: { type: "solana", key: "/dev/null" },
  budgets: { perCall: 1, daily: 50 },
  network: "solana",
};

describe("1ly_search", () => {
  it("returns simplified results", async () => {
    const fetchMock = async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "1",
              title: "Weather",
              description: "Test",
              endpoint: "/api/link/joe/weather",
              price: 0.01,
              currency: "USD",
              type: "api",
              seller: { username: "joe", displayName: "Joe" },
              stats: { buyers: 1, reviews: 0, rating: null },
            },
          ],
          pagination: { total: 1, limit: 10, offset: 0, hasMore: false },
          meta: { responseTime: "1ms" },
        })
      );

    globalThis.fetch = fetchMock;

    const res = await handleSearch({ query: "weather" }, config);
    const text = (res.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as { ok: boolean; data: { results: Array<{ title: string }> } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.results[0].title).toBe("Weather");
  });
});

