/**
 * DcpRemoteProvider - DCP Relay integration (Phase 1)
 *
 * Routes signing/credential operations through the DCP relay to a user's local DCP vault.
 * Uses WebSocket when available, falls back to long-poll if blocked.
 */

import type {
  VaultProvider,
  X402SignParams,
  X402SignResult,
  BudgetCheckResult,
  EIP712TypedData,
} from "./interface.js";
import WebSocket, { ErrorEvent as WsErrorEvent, MessageEvent as WsMessageEvent } from "ws";
import { CipherSuite, HkdfSha256 } from "@hpke/core";
import { DhkemX25519HkdfSha256 } from "@hpke/dhkem-x25519";
import { Chacha20Poly1305 } from "@hpke/chacha20poly1305";
type CryptoKey = unknown;

const DEFAULT_RELAY_URL = "wss://relay.dcp.1ly.store";
const REQUEST_TIMEOUT_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

const AGENT_NAME = process.env.MCP_AGENT_NAME || "1ly-mcp";

/**
 * DCP Remote error with code mapping
 */
export class DcpRemoteError extends Error {
  constructor(
    message: string,
    public code: string,
    public meta?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DcpRemoteError";
  }
}

type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

type RelayActionType = "sign" | "read" | "write" | "budget";

interface RelayEnvelope {
  version: "1";
  vault_id: string;
  request_id: string;
  action_type: RelayActionType;
  encrypted_payload: string;
  expires_at: string;
}

interface RelayEnvelopeResponse {
  request_id: string;
  encrypted_payload?: string;
  error?: { code: string; message: string; meta?: Record<string, unknown> };
}

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  replyPrivateKey: CryptoKey;
  actionType: RelayActionType;
  requestId: string;
}

export class DcpRemoteProvider implements VaultProvider {
  readonly type = "dcp-remote" as const;

  private vaultId: string;
  private relayUrl: string;
  private relayToken: string;

  private ws: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private pendingRequests = new Map<string, PendingRequest>();
  private messageIdCounter = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  // Cached addresses to avoid repeated relay calls
  private cachedAddresses: { solana?: string; evm?: string } = {};
  private sessionByScope = new Map<string, string>();
  private hpkeSuite = new CipherSuite({
    kem: new DhkemX25519HkdfSha256(),
    kdf: new HkdfSha256(),
    aead: new Chacha20Poly1305(),
  });
  private vaultHpkePublicKey?: CryptoKey;

  constructor(vaultId: string) {
    if (!vaultId) {
      throw new DcpRemoteError(
        "DcpRemoteProvider requires DCP_VAULT_ID",
        "MISSING_VAULT_ID"
      );
    }

    this.vaultId = vaultId;
    this.relayUrl = process.env.DCP_RELAY_URL || DEFAULT_RELAY_URL;
    this.relayToken = process.env.DCP_RELAY_TOKEN || "";
  }

  /**
   * Connect to the relay with WebSocket
   */
  private async connect(): Promise<void> {
    if (this.state === "connected") return;
    if (this.state === "connecting") {
      await this.waitForConnection();
      return;
    }

    this.state = "connecting";

    return new Promise((resolve, reject) => {
      try {
        const url = new URL(this.relayUrl);
        url.searchParams.set("vault_id", this.vaultId);
        if (this.relayToken) {
          url.searchParams.set("token", this.relayToken);
        }

        this.ws = new WebSocket(url.toString());

        const connectionTimeout = setTimeout(() => {
          this.ws?.close();
          this.state = "disconnected";
          reject(new DcpRemoteError("Relay connection timeout", "VAULT_OFFLINE"));
        }, REQUEST_TIMEOUT_MS);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.state = "connected";
          this.startHeartbeat();
          resolve();
        };

        this.ws.onclose = () => {
          this.handleDisconnect();
        };

        this.ws.onerror = (event: WsErrorEvent) => {
          clearTimeout(connectionTimeout);
          this.state = "disconnected";
          reject(
            new DcpRemoteError(
              (event.error as Error | undefined)?.message || "Relay connection failed",
              "VAULT_OFFLINE"
            )
          );
        };

        this.ws.onmessage = (event: WsMessageEvent) => {
          this.handleMessage(event.data.toString());
        };
      } catch (error) {
        this.state = "disconnected";
        reject(
          new DcpRemoteError(
            error instanceof Error ? error.message : "Failed to connect to relay",
            "VAULT_OFFLINE"
          )
        );
      }
    });
  }

  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new DcpRemoteError("Connection wait timeout", "VAULT_OFFLINE"));
      }, REQUEST_TIMEOUT_MS);

      const checkState = () => {
        if (this.state === "connected") {
          clearTimeout(timeout);
          resolve();
        } else if (this.state === "disconnected") {
          clearTimeout(timeout);
          reject(new DcpRemoteError("Connection failed", "VAULT_OFFLINE"));
        } else {
          setTimeout(checkState, 100);
        }
      };
      checkState();
    });
  }

  private handleDisconnect(): void {
    this.stopHeartbeat();
    this.state = "disconnected";

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new DcpRemoteError("Relay disconnected", "VAULT_OFFLINE"));
      this.pendingRequests.delete(id);
    }

    // Don't auto-reconnect here; let the next request trigger reconnection
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as RelayEnvelopeResponse;

      // Handle response to a pending request
      if (message.request_id && this.pendingRequests.has(message.request_id)) {
        const pending = this.pendingRequests.get(message.request_id)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.request_id);

        if (message.error) {
          pending.reject(
            new DcpRemoteError(
              message.error.message,
              message.error.code,
              message.error.meta
            )
          );
        } else if (message.encrypted_payload) {
          this.decryptPayload(
            message.encrypted_payload,
            pending.actionType,
            pending.requestId,
            pending.replyPrivateKey
          )
            .then((decrypted) => pending.resolve(decrypted))
            .catch((error) =>
              pending.reject(
                error instanceof Error
                  ? error
                  : new DcpRemoteError("Relay response decrypt failed", "RELAY_UNAVAILABLE")
              )
            );
        } else {
          pending.reject(new DcpRemoteError("Relay response missing payload", "RELAY_UNAVAILABLE"));
        }
      }

      // Handle heartbeat pong
      if ((message as { type?: string }).type === "pong") {
        // Connection is alive
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.state === "connected") {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send a request through the relay and wait for response
   */
  private async relayRequest<T extends Record<string, unknown>>(
    actionType: RelayActionType,
    payload: Record<string, unknown>
  ): Promise<T> {
    const safeJsonStringify = (value: unknown) =>
      JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));

    // Ensure connected
    if (this.state !== "connected") {
      try {
        await this.connect();
      } catch {
        // Try long-poll fallback
        return this.longPollRequest<T>(actionType, payload);
      }
    }

    const requestId = this.generateRequestId();
    const { encryptedPayload, replyPrivateKey } = await this.encryptPayload(
      {
        ...payload,
        agent_name: AGENT_NAME,
      },
      actionType,
      requestId
    );
    const message: RelayEnvelope = {
      version: "1",
      vault_id: this.vaultId,
      request_id: requestId,
      action_type: actionType,
      encrypted_payload: encryptedPayload,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new DcpRemoteError("Request timeout", "RELAY_TIMEOUT"));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: Record<string, unknown>) => void,
        reject,
        timeout,
        replyPrivateKey,
        actionType,
        requestId,
      });

      try {
        this.ws!.send(safeJsonStringify(message));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(
          new DcpRemoteError(
            error instanceof Error ? error.message : "Failed to send message",
            "RELAY_UNAVAILABLE"
          )
        );
      }
    });
  }

  /**
   * Long-poll fallback when WebSocket is not available
   */
  private async longPollRequest<T extends Record<string, unknown>>(
    actionType: RelayActionType,
    payload: Record<string, unknown>
  ): Promise<T> {
    const safeJsonStringify = (value: unknown) =>
      JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));

    const httpUrl = this.relayUrl
      .replace("wss://", "https://")
      .replace("ws://", "http://");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const requestId = this.generateRequestId();
      const { encryptedPayload, replyPrivateKey } = await this.encryptPayload(
        {
          ...payload,
          agent_name: AGENT_NAME,
        },
        actionType,
        requestId
      );
      const response = await fetch(`${httpUrl}/relay/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.relayToken
            ? {
                Authorization: `Bearer ${this.relayToken}`,
                "X-DCP-PAIRING-TOKEN": this.relayToken,
              }
            : {}),
        },
        body: safeJsonStringify({
          version: "1",
          vault_id: this.vaultId,
          request_id: requestId,
          action_type: actionType,
          encrypted_payload: encryptedPayload,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        } satisfies RelayEnvelope),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({
          error: { message: "Relay request failed", code: "VAULT_OFFLINE" },
        }))) as { error?: { message?: string; code?: string; meta?: Record<string, unknown> } };

        throw new DcpRemoteError(
          errorBody.error?.message || "Relay request failed",
          errorBody.error?.code || "VAULT_OFFLINE",
          errorBody.error?.meta
        );
      }

      const envelope = (await response.json()) as RelayEnvelopeResponse;
      if (envelope.error) {
        throw new DcpRemoteError(
          envelope.error.message || "Relay request failed",
          envelope.error.code || "RELAY_UNAVAILABLE",
          envelope.error.meta
        );
      }

      // Some relay implementations return the response inline
      if (envelope.encrypted_payload) {
        return (await this.decryptPayload(
          envelope.encrypted_payload,
          actionType,
          requestId,
          replyPrivateKey
        )) as T;
      }

      const deadline = Date.now() + REQUEST_TIMEOUT_MS;
      const pollHeaders = {
        ...(this.relayToken
          ? {
              Authorization: `Bearer ${this.relayToken}`,
              "X-DCP-PAIRING-TOKEN": this.relayToken,
            }
          : {}),
      };

      while (Date.now() < deadline) {
        const pollResponse = await fetch(
          `${httpUrl}/relay/response/${encodeURIComponent(requestId)}`,
          {
            method: "GET",
            headers: pollHeaders,
          }
        );

        if (pollResponse.status === 404 || pollResponse.status === 204) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }

        if (!pollResponse.ok) {
          throw new DcpRemoteError("Relay response fetch failed", "RELAY_UNAVAILABLE");
        }

        const pollBody = (await pollResponse.json()) as RelayEnvelopeResponse;
        if (pollBody.error) {
          throw new DcpRemoteError(
            pollBody.error.message || "Relay response failed",
            pollBody.error.code || "RELAY_UNAVAILABLE",
            pollBody.error.meta
          );
        }
        if (!pollBody.encrypted_payload) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }

        return (await this.decryptPayload(
          pollBody.encrypted_payload,
          actionType,
          requestId,
          replyPrivateKey
        )) as T;
      }

      throw new DcpRemoteError("Relay response timeout", "RELAY_TIMEOUT");
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof DcpRemoteError) {
        throw error;
      }

      throw new DcpRemoteError(
        error instanceof Error ? error.message : "Relay request failed",
        "RELAY_UNAVAILABLE"
      );
    }
  }

  /**
   * Map internal chain names to DCP chain names
   */
  private mapChain(chain: "solana" | "evm"): "solana" | "base" {
    return chain === "evm" ? "base" : chain;
  }

  private generateRequestId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    const now = Date.now().toString(36);
    const counter = (++this.messageIdCounter).toString(36);
    return `req_${now}_${counter}`;
  }

  private async getVaultHpkePublicKey(): Promise<CryptoKey> {
    if (this.vaultHpkePublicKey) {
      return this.vaultHpkePublicKey;
    }

    const pubKeyBase64 =
      process.env.DCP_VAULT_HPKE_PUBLIC_KEY || process.env.DCP_VAULT_HPKE_PUB;

    if (!pubKeyBase64) {
      throw new DcpRemoteError(
        "Missing DCP_VAULT_HPKE_PUBLIC_KEY for relay encryption",
        "RELAY_UNAVAILABLE"
      );
    }

    const kem = this.hpkeSuite.kem;
    const pubKeyBytes = Buffer.from(pubKeyBase64, "base64");
    const pubKeyArrayBuffer = pubKeyBytes.buffer.slice(
      pubKeyBytes.byteOffset,
      pubKeyBytes.byteOffset + pubKeyBytes.byteLength
    );
    this.vaultHpkePublicKey = await kem.deserializePublicKey(pubKeyArrayBuffer);
    return this.vaultHpkePublicKey;
  }

  private buildAad(actionType: RelayActionType, requestId: string): ArrayBuffer {
    const aad = `1|${this.vaultId}|${requestId}|${actionType}`;
    return new TextEncoder().encode(aad).buffer;
  }

  private async encryptPayload(
    payload: Record<string, unknown>,
    actionType: RelayActionType,
    requestId: string
  ): Promise<{ encryptedPayload: string; replyPrivateKey: CryptoKey }> {
    const kem = this.hpkeSuite.kem;
    const replyKeyPair = await kem.generateKeyPair();
    const replyPublicKey = await kem.serializePublicKey(replyKeyPair.publicKey);
    const payloadWithReply = {
      ...payload,
      reply_public_key: Buffer.from(replyPublicKey).toString("base64"),
    };


    if (process.env.DCP_RELAY_PLAINTEXT === "1") {
      return {
        encryptedPayload: Buffer.from(JSON.stringify(payloadWithReply), "utf8").toString("base64"),
        replyPrivateKey: replyKeyPair.privateKey,
      };
    }

    const vaultPublicKey = await this.getVaultHpkePublicKey();

    const plaintext = new TextEncoder().encode(JSON.stringify(payloadWithReply)).buffer;
    const aad = this.buildAad(actionType, requestId);
    const sealed = await this.hpkeSuite.seal(
      { recipientPublicKey: vaultPublicKey },
      plaintext,
      aad
    );

    const encBytes = Buffer.from(sealed.enc);
    const ctBytes = Buffer.from(sealed.ct);
    const serialized = Buffer.concat([encBytes, ctBytes]);
    const encryptedPayload = serialized.toString("base64");

    return { encryptedPayload, replyPrivateKey: replyKeyPair.privateKey };
  }

  private async decryptPayload(
    payload: string,
    actionType: RelayActionType,
    requestId: string,
    replyPrivateKey: CryptoKey
  ): Promise<Record<string, unknown>> {
    if (process.env.DCP_RELAY_PLAINTEXT === "1") {
      const decoded = Buffer.from(payload, "base64").toString("utf8");
      return JSON.parse(decoded) as Record<string, unknown>;
    }

    const aad = this.buildAad(actionType, requestId);
    const serialized = Buffer.from(payload, "base64");
    const encSize = this.hpkeSuite.kem.encSize;
    if (serialized.length <= encSize) {
      throw new DcpRemoteError("Invalid encrypted payload length", "RELAY_UNAVAILABLE");
    }
    const enc = serialized.subarray(0, encSize);
    const ct = serialized.subarray(encSize);

    const plaintext = await this.hpkeSuite.open(
      {
        recipientKey: replyPrivateKey,
        enc: enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength),
      },
      ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength),
      aad
    );

    const decoded = Buffer.from(plaintext).toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  }

  private getSession(scope: string): string | undefined {
    return this.sessionByScope.get(scope);
  }

  private setSession(scope: string, sessionId?: string | null) {
    if (sessionId) {
      this.sessionByScope.set(scope, sessionId);
    }
  }

  // === VaultProvider Implementation ===

  async signX402Payment(params: X402SignParams): Promise<X402SignResult> {
    const scope = params.network === "base" ? "crypto.wallet.base" : "crypto.wallet.solana";
    const result = await this.relayRequest<{
      signature?: string;
      public_key?: string;
      requires_consent?: boolean;
      consent_id?: string;
      expires_at?: string;
      message?: string;
      session_id?: string;
    }>("sign", {
      method: "vault_sign_x402",
      params: {
        network: params.network,
        payload: Buffer.from(params.paymentPayload).toString("base64"),
        amount: params.amount,
        currency: params.currency,
        recipient: params.recipient,
        purpose: params.purpose,
        typed_data: params.typedData,
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      throw new DcpRemoteError(
        "User consent required. Please approve in DCP app.",
        "CONSENT_REQUIRED",
        {
          consent_id: result.consent_id,
          expires_at: result.expires_at,
          action: "approve_in_dcp_app",
          message: result.message,
        }
      );
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
    const result = await this.relayRequest<{
      signed_tx?: string;
      requires_consent?: boolean;
      consent_id?: string;
      session_id?: string;
    }>("sign", {
      method: "vault_sign",
      params: {
        chain: "solana",
        unsigned_tx: Buffer.from(unsignedTx).toString("base64"),
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      throw new DcpRemoteError(
        "User consent required. Please approve in DCP app.",
        "CONSENT_REQUIRED",
        { consent_id: result.consent_id }
      );
    }

    this.setSession(scope, result.session_id);

    return Buffer.from(result.signed_tx!, "base64");
  }

  async signSolanaPayload(payload: Uint8Array): Promise<Uint8Array> {
    const scope = "crypto.wallet.solana";
    const result = await this.relayRequest<{
      signature?: string;
      requires_consent?: boolean;
      consent_id?: string;
      session_id?: string;
    }>("sign", {
      method: "vault_sign_message",
      params: {
        chain: "solana",
        message: Buffer.from(payload).toString("base64"),
        encoding: "base64",
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      throw new DcpRemoteError(
        "User consent required. Please approve in DCP app.",
        "CONSENT_REQUIRED",
        { consent_id: result.consent_id }
      );
    }

    this.setSession(scope, result.session_id);

    return Buffer.from(result.signature!, "base64");
  }

  async signEvmTypedData(typedData: EIP712TypedData): Promise<string> {
    const scope = "crypto.wallet.base";
    const result = await this.relayRequest<{
      signature?: string;
      requires_consent?: boolean;
      consent_id?: string;
      session_id?: string;
    }>("sign", {
      method: "vault_sign_typed_data",
      params: {
        chain: "base",
        typed_data: typedData,
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      throw new DcpRemoteError(
        "User consent required. Please approve in DCP app.",
        "CONSENT_REQUIRED",
        { consent_id: result.consent_id }
      );
    }

    this.setSession(scope, result.session_id);

    return result.signature!;
  }

  async signMessage(message: string, chain: "solana" | "evm"): Promise<string> {
    const scope = chain === "evm" ? "crypto.wallet.base" : "crypto.wallet.solana";
    const result = await this.relayRequest<{
      signature?: string;
      requires_consent?: boolean;
      consent_id?: string;
      session_id?: string;
    }>("sign", {
      method: "vault_sign_message",
      params: {
        chain: this.mapChain(chain),
        message,
        encoding: "utf8",
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      throw new DcpRemoteError(
        "User consent required. Please approve in DCP app.",
        "CONSENT_REQUIRED",
        { consent_id: result.consent_id }
      );
    }

    this.setSession(scope, result.session_id);

    return result.signature!;
  }

  async readCredential(scope: string): Promise<string | null> {
    const result = await this.relayRequest<{
      data?: unknown;
      sensitivity?: string;
      requires_consent?: boolean;
      consent_id?: string;
      session_id?: string;
    }>("read", {
      method: "vault_read",
      params: {
        scope,
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      throw new DcpRemoteError(
        "User consent required. Please approve in DCP app.",
        "CONSENT_REQUIRED",
        { consent_id: result.consent_id }
      );
    }

    if (result.sensitivity === "critical") {
      return null;
    }

    this.setSession(scope, result.session_id);

    if (result.data && typeof result.data === "object") {
      const dataObj = result.data as Record<string, unknown>;
      return typeof dataObj.key === "string" ? dataObj.key : JSON.stringify(result.data);
    }

    return typeof result.data === "string" ? result.data : null;
  }

  async writeCredential(scope: string, value: string): Promise<void> {
    const result = await this.relayRequest<{
      success?: boolean;
      requires_consent?: boolean;
      consent_id?: string;
      session_id?: string;
    }>("write", {
      method: "vault_write",
      params: {
        scope,
        data: { key: value },
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      throw new DcpRemoteError(
        "User consent required. Please approve in DCP app.",
        "CONSENT_REQUIRED",
        { consent_id: result.consent_id }
      );
    }

    this.setSession(scope, result.session_id);
  }

  async readData(scope: string): Promise<Record<string, unknown> | null> {
    const result = await this.relayRequest<{
      data?: Record<string, unknown>;
      sensitivity?: string;
      requires_consent?: boolean;
      consent_id?: string;
      session_id?: string;
    }>("read", {
      method: "vault_read",
      params: {
        scope,
        session_id: this.getSession(scope) || null,
      },
    });

    if (result.requires_consent) {
      throw new DcpRemoteError(
        "User consent required. Please approve in DCP app.",
        "CONSENT_REQUIRED",
        { consent_id: result.consent_id }
      );
    }

    if (result.sensitivity === "critical") {
      return null;
    }

    this.setSession(scope, result.session_id);

    return result.data || null;
  }

  async getPublicAddress(chain: "solana" | "evm"): Promise<string> {
    // Return cached address if available
    if (chain === "solana" && this.cachedAddresses.solana) {
      return this.cachedAddresses.solana;
    }
    if (chain === "evm" && this.cachedAddresses.evm) {
      return this.cachedAddresses.evm;
    }

    const dcpChain = this.mapChain(chain);

    const result = await this.relayRequest<{
      address: string;
    }>("read", {
      method: "get_address",
      params: {
        chain: dcpChain,
      },
    });

    // Cache the address
    if (chain === "solana") {
      this.cachedAddresses.solana = result.address;
    } else {
      this.cachedAddresses.evm = result.address;
    }

    return result.address;
  }

  async checkBudget(
    amount: number,
    currency: string,
    chain?: "solana" | "base" | "ethereum"
  ): Promise<BudgetCheckResult> {
    const result = await this.relayRequest<{
      allowed: boolean;
      remaining: { daily: number };
      reason?: string;
    }>("budget", {
      method: "budget_check",
      params: {
        amount,
        currency,
        chain: chain || "solana",
      },
    });

    return {
      allowed: result.allowed,
      remaining: result.remaining.daily,
      currency,
      reason: result.reason,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try to connect and ping
      if (this.state !== "connected") {
        await this.connect();
      }

      // Simple health check
      await this.relayRequest<{ ok: boolean }>("read", { method: "ping", params: {} });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the vault ID for this remote provider
   */
  getVaultId(): string {
    return this.vaultId;
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Close the connection
   */
  close(): void {
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.state = "disconnected";
  }
}
