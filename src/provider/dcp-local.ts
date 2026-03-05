/**
 * DcpLocalProvider - DCP (Delegated Custody Protocol) integration
 *
 * Talks to DCP at localhost:8420. Full consent + budgets.
 * Uses DCP REST API endpoints as documented in PRD-MCPnextV1.md.
 */

import type {
  VaultProvider,
  X402SignParams,
  X402SignResult,
  BudgetCheckResult,
  EIP712TypedData,
} from "./interface.js";

const DCP_BASE_URL = process.env.DCP_URL || "http://localhost:8420";
const DCP_TIMEOUT_MS = 10000;
const DCP_CHECK_TIMEOUT_MS = 100;
const AGENT_NAME = process.env.MCP_AGENT_NAME || "1ly-mcp";

/**
 * Map our internal 'evm' to DCP's chain names
 */
function mapChain(chain: "solana" | "evm"): "solana" | "base" {
  return chain === "evm" ? "base" : chain;
}

/**
 * Custom error for DCP-specific issues
 */
export class DcpError extends Error {
  constructor(
    message: string,
    public code: string,
    public meta?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DcpError";
  }
}

/**
 * Check if DCP is running and unlocked
 */
export async function checkDcpStatus(): Promise<"responsive" | "locked" | "not_running"> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DCP_CHECK_TIMEOUT_MS);

    const response = await fetch(`${DCP_BASE_URL}/health`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return "not_running";

    const status = (await response.json()) as { status: string; unlocked: boolean; version: string };
    return status.unlocked ? "responsive" : "locked";
  } catch {
    return "not_running";
  }
}

export class DcpLocalProvider implements VaultProvider {
  readonly type = "dcp-local" as const;

  private sessionByScope = new Map<string, string>();

  private async dcpFetch<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST";
      body?: Record<string, unknown>;
      query?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DCP_TIMEOUT_MS);
    const safeJsonStringify = (value: unknown) =>
      JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));

    try {
      let url = `${DCP_BASE_URL}${endpoint}`;
      if (options.query) {
        const params = new URLSearchParams(options.query);
        url += `?${params.toString()}`;
      }

      const fetchOptions: RequestInit = {
        method: options.method || "GET",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      };

      if (options.body) {
        fetchOptions.body = safeJsonStringify(options.body);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({
          error: { message: "DCP request failed", code: "DCP_REQUEST_FAILED" },
        }))) as { error?: { message?: string; code?: string } };
        throw new DcpError(
          errorBody.error?.message || "DCP request failed",
          errorBody.error?.code || "DCP_REQUEST_FAILED"
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private handleConsentResponse(response: {
    requires_consent?: boolean;
    consent_id?: string;
    expires_at?: string;
    message?: string;
  }): never {
    throw new DcpError(
      `User consent required. Please approve in DCP app.`,
      "CONSENT_REQUIRED",
      {
        consent_id: response.consent_id,
        expires_at: response.expires_at,
        action: "approve_in_dcp_app",
        message: response.message,
      }
    );
  }

  private getSession(scope: string): string | undefined {
    return this.sessionByScope.get(scope);
  }

  private setSession(scope: string, sessionId?: string | null) {
    if (sessionId) {
      this.sessionByScope.set(scope, sessionId);
    }
  }

  async signX402Payment(params: X402SignParams): Promise<X402SignResult> {
    const scope = params.network === "base" ? "crypto.wallet.base" : "crypto.wallet.solana";
    const result = await this.dcpFetch<{
      requires_consent?: boolean;
      consent_id?: string;
      expires_at?: string;
      message?: string;
      signature?: string;
      public_key?: string;
      session_id?: string;
    }>("/v1/vault/sign_x402", {
      method: "POST",
      body: {
        network: params.network,
        payload: Buffer.from(params.paymentPayload).toString("base64"),
        amount: params.amount,
        currency: params.currency,
        recipient: params.recipient,
        purpose: params.purpose,
        typed_data: params.typedData,
        agent_name: AGENT_NAME,
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      this.handleConsentResponse(result);
    }

    this.setSession(scope, result.session_id);

    const address = await this.getPublicAddress(params.network === "base" ? "evm" : "solana");

    return {
      signature: result.signature!,
      publicKey: result.public_key || address,
    };
  }

  async signSolanaTransaction(unsignedTx: Uint8Array): Promise<Uint8Array> {
    const scope = "crypto.wallet.solana";
    const result = await this.dcpFetch<{
      requires_consent?: boolean;
      consent_id?: string;
      expires_at?: string;
      message?: string;
      signed_tx?: string;
      signature?: string;
      session_id?: string;
    }>("/v1/vault/sign", {
      method: "POST",
      body: {
        chain: "solana",
        unsigned_tx: Buffer.from(unsignedTx).toString("base64"),
        agent_name: AGENT_NAME,
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      this.handleConsentResponse(result);
    }

    this.setSession(scope, result.session_id);

    return Buffer.from(result.signed_tx!, "base64");
  }

  async signSolanaPayload(payload: Uint8Array): Promise<Uint8Array> {
    const scope = "crypto.wallet.solana";
    const result = await this.dcpFetch<{
      requires_consent?: boolean;
      consent_id?: string;
      expires_at?: string;
      message?: string;
      signature?: string;
      session_id?: string;
    }>("/v1/vault/sign_message", {
      method: "POST",
      body: {
        chain: "solana",
        message: Buffer.from(payload).toString("base64"),
        encoding: "base64",
        agent_name: AGENT_NAME,
        session_id: this.getSession(scope) || null,
        description: "Solana payload signing",
      },
    });

    if (result.requires_consent) {
      this.handleConsentResponse(result);
    }

    this.setSession(scope, result.session_id);

    // Return signature bytes
    return Buffer.from(result.signature!, "base64");
  }

  async signEvmTypedData(typedData: EIP712TypedData): Promise<string> {
    const scope = "crypto.wallet.base";
    const result = await this.dcpFetch<{
      requires_consent?: boolean;
      consent_id?: string;
      expires_at?: string;
      message?: string;
      signature?: string;
      public_key?: string;
      session_id?: string;
    }>("/v1/vault/sign_typed_data", {
      method: "POST",
      body: {
        chain: "base",
        typed_data: typedData,
        agent_name: AGENT_NAME,
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      this.handleConsentResponse(result);
    }

    this.setSession(scope, result.session_id);

    return result.signature!;
  }

  async signMessage(message: string, chain: "solana" | "evm"): Promise<string> {
    const dcpChain = mapChain(chain);
    const scope = `crypto.wallet.${dcpChain}`;

    const result = await this.dcpFetch<{
      requires_consent?: boolean;
      consent_id?: string;
      expires_at?: string;
      message?: string;
      signature?: string;
      public_key?: string;
      session_id?: string;
    }>("/v1/vault/sign_message", {
      method: "POST",
      body: {
        chain: dcpChain,
        message,
        encoding: "utf8",
        agent_name: AGENT_NAME,
        session_id: this.getSession(scope) || null,
        description: "Message signing",
      },
    });

    if (result.requires_consent) {
      this.handleConsentResponse(result);
    }

    this.setSession(scope, result.session_id);

    return result.signature!;
  }

  async readCredential(scope: string): Promise<string | null> {
    const result = await this.dcpFetch<{
      requires_consent?: boolean;
      consent_id?: string;
      expires_at?: string;
      message?: string;
      scope?: string;
      data?: unknown;
      sensitivity?: string;
      session_id?: string;
    }>("/v1/vault/read", {
      method: "POST",
      body: {
        scope,
        agent_name: AGENT_NAME,
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      this.handleConsentResponse(result);
    }

    // Critical data cannot be read directly
    if (result.sensitivity === "critical") {
      return null;
    }

    this.setSession(scope, result.session_id);

    // DCP returns { scope, data }
    if (result.data && typeof result.data === "object") {
      const dataObj = result.data as Record<string, unknown>;
      return typeof dataObj.key === "string"
        ? dataObj.key
        : JSON.stringify(result.data);
    }

    return typeof result.data === "string" ? result.data : null;
  }

  async writeCredential(scope: string, value: string): Promise<void> {
    const result = await this.dcpFetch<{
      requires_consent?: boolean;
      consent_id?: string;
      expires_at?: string;
      message?: string;
      success?: boolean;
      session_id?: string;
    }>("/v1/vault/write", {
      method: "POST",
      body: {
        scope,
        data: { key: value },
        agent_name: AGENT_NAME,
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      this.handleConsentResponse(result);
    }

    this.setSession(scope, result.session_id);
  }

  async readData(scope: string): Promise<Record<string, unknown> | null> {
    const result = await this.dcpFetch<{
      requires_consent?: boolean;
      consent_id?: string;
      expires_at?: string;
      message?: string;
      scope?: string;
      data?: Record<string, unknown>;
      sensitivity?: string;
      session_id?: string;
    }>("/v1/vault/read", {
      method: "POST",
      body: {
        scope,
        agent_name: AGENT_NAME,
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      this.handleConsentResponse(result);
    }

    if (result.sensitivity === "critical") {
      return null;
    }

    this.setSession(scope, result.session_id);

    return result.data || null;
  }

  async getPublicAddress(chain: "solana" | "evm"): Promise<string> {
    const dcpChain = mapChain(chain);

    const result = await this.dcpFetch<{
      chain: string;
      address: string;
    }>(`/address/${dcpChain}`);

    return result.address;
  }

  async checkBudget(
    amount: number,
    currency: string,
    chain?: "solana" | "base" | "ethereum"
  ): Promise<BudgetCheckResult> {
    const result = await this.dcpFetch<{
      allowed: boolean;
      limits: { per_tx: number; daily: number; approval_threshold: number };
      remaining: { daily: number; per_tx: number };
      requires_approval: boolean;
      reason: string | null;
    }>("/budget/check", {
      query: {
        amount: amount.toString(),
        currency,
        chain: chain || "solana",
      },
    });

    return {
      allowed: result.allowed,
      remaining: result.remaining.daily,
      currency,
      reason: result.reason || undefined,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const status = await checkDcpStatus();
      return status === "responsive";
    } catch {
      return false;
    }
  }

  /**
   * Clear cached session (useful for testing)
   */
  clearSession(): void {
    this.sessionByScope.clear();
  }
}
