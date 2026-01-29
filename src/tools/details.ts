import { z } from "zod";
import type { Config } from "../config.js";
import type { ReviewsResponse } from "../types.js";
import { fetchWithTimeout, assertOk, HttpError } from "../http.js";
import { mcpOk } from "../mcp.js";

export const detailsTool = {
  name: "1ly_get_details",
  description:
    "Get detailed information about a specific API on 1ly.store, including pricing, reviews, and payment info.",
  inputSchema: {
    type: "object" as const,
    properties: {
      endpoint: {
        type: "string",
        description:
          "API endpoint path (e.g., 'joe/weather' or '/api/link/joe/weather')",
      },
    },
    required: ["endpoint"],
  },
};

const InputSchema = z.object({
  endpoint: z.string(),
});

function parseEndpoint(endpoint: string): { username: string; slug: string } {
  const cleaned = endpoint.replace(/^\/api\/link\//, "").replace(/^\//, "");
  const [username, slug] = cleaned.split("/");

  if (!username || !slug) {
    throw new Error(
      `Invalid endpoint format. Expected 'username/slug' or '/api/link/username/slug'`
    );
  }

  return { username, slug };
}

export async function handleDetails(args: unknown, config: Config) {
  const input = InputSchema.parse(args);
  const { username, slug } = parseEndpoint(input.endpoint);

  const linkUrl = `${config.apiBase}/api/link/${username}/${slug}`;
  const linkResponse = await fetchWithTimeout(linkUrl, {
    headers: {
      Accept: "application/json",
    },
  });

  let linkData: Record<string, unknown> = {};
  let paymentInfo: Record<string, unknown> = {};

  if (linkResponse.status === 402) {
    const x402Header = linkResponse.headers.get("X-Payment-Requirements");
    if (x402Header) {
      try {
        paymentInfo = JSON.parse(x402Header) as Record<string, unknown>;
      } catch {
        // Ignore parse errors
      }
    }
    try {
      linkData = (await linkResponse.json()) as Record<string, unknown>;
    } catch {
      // Response might not be JSON for 402
    }
  } else if (linkResponse.ok) {
    linkData = (await linkResponse.json()) as Record<string, unknown>;
  } else {
    await assertOk(linkResponse, "Failed to get details");
  }

  const reviewsUrl = `${config.apiBase}/api/reviews?username=${username}&slug=${slug}&limit=5`;
  let reviewsData: ReviewsResponse | null = null;

  try {
    const reviewsResponse = await fetchWithTimeout(reviewsUrl);
    if (reviewsResponse.ok) {
      reviewsData = (await reviewsResponse.json()) as ReviewsResponse;
    }
  } catch (error) {
    // Reviews fetch is optional; include context in error logs if needed
    if (error instanceof HttpError) {
      // Swallow but could be logged in the future
    }
  }

  const result = {
    endpoint: `/api/link/${username}/${slug}`,
    fullUrl: `${config.apiBase}/api/link/${username}/${slug}`,
    ...linkData,
    paymentInfo: {
      networks: ["solana", "base"],
      ...paymentInfo,
    },
    reviews: reviewsData
      ? {
          stats: reviewsData.stats,
          recent: reviewsData.reviews.slice(0, 5).map((r) => ({
            positive: r.positive,
            comment: r.comment,
          })),
        }
      : null,
  };

  return mcpOk(result);
}
