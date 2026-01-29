import { z } from "zod";
import type { Config } from "../config.js";
import type { SearchResponse } from "../types.js";
import { fetchWithTimeout, assertOk } from "../http.js";
import { mcpOk } from "../mcp.js";

export const searchTool = {
  name: "1ly_search",
  description:
    "Search for APIs and services on 1ly.store marketplace. Find APIs by keyword, filter by type and price.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search term (e.g., 'weather api', 'image generation')",
      },
      type: {
        type: "string",
        enum: ["api", "standard"],
        description: "Filter by link type: 'api' for API endpoints, 'standard' for digital products",
      },
      maxPrice: {
        type: "number",
        description: "Maximum price in USD",
      },
      minPrice: {
        type: "number",
        description: "Minimum price in USD",
      },
      limit: {
        type: "number",
        description: "Number of results (default: 10, max: 50)",
      },
    },
    required: ["query"],
  },
};

const InputSchema = z.object({
  query: z.string(),
  type: z.enum(["api", "standard"]).optional(),
  maxPrice: z.number().optional(),
  minPrice: z.number().optional(),
  limit: z.number().min(1).max(50).optional().default(10),
});

export async function handleSearch(args: unknown, config: Config) {
  const input = InputSchema.parse(args);

  const params = new URLSearchParams();
  params.set("q", input.query);
  params.set("limit", input.limit.toString());

  if (input.type) params.set("type", input.type);
  if (input.maxPrice !== undefined) params.set("maxPrice", input.maxPrice.toString());
  if (input.minPrice !== undefined) params.set("minPrice", input.minPrice.toString());

  const url = `${config.apiBase}/api/discover?${params}`;

  const response = await fetchWithTimeout(url);
  await assertOk(response, "Search failed");

  const data = (await response.json()) as SearchResponse;

  const simplified = {
    results: data.results.map((r) => ({
      title: r.title,
      description: r.description,
      endpoint: r.endpoint,
      price: `$${r.price} ${r.currency}`,
      type: r.type,
      seller: r.seller.displayName || r.seller.username,
      stats: {
        buyers: r.stats.buyers,
        rating: r.stats.rating ? `${r.stats.rating}%` : "No reviews",
      },
    })),
    total: data.pagination.total,
    showing: data.results.length,
  };

  return mcpOk(simplified);
}
