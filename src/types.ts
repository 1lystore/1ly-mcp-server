export interface ApiResult {
  id: string;
  title: string;
  description: string;
  endpoint: string;
  price: number;
  currency: string;
  type: "api" | "standard";
  seller: {
    username: string;
    displayName: string;
  };
  stats: {
    buyers: number;
    reviews: number;
    rating: number | null;
  };
}

export interface SearchResponse {
  results: ApiResult[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  meta: {
    responseTime: string;
  };
}

export interface Review {
  id: string;
  positive: boolean;
  comment: string | null;
  wallet: string;
  createdAt: string;
}

export interface ReviewsResponse {
  reviews: Review[];
  stats: {
    total: number;
    positive: number;
    negative: number;
    rating: number | null;
  };
}

export interface PaymentRequirements {
  network: string;
  price: string;
  treasury: string;
  facilitator?: string;
}

export interface PurchaseMetadata {
  purchaseId: string;
  reviewUrl: string;
  reviewToken: string;
  paidAmount?: number;
  network?: string;
  txSignature?: string;
}
