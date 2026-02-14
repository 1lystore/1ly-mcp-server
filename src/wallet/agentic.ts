import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const IPC_DIR = "/tmp/payments-mcp-ui-bridge";
const REQUESTS_DIR = path.join(IPC_DIR, "requests");
const RESPONSES_DIR = path.join(IPC_DIR, "responses");

export interface AgenticWalletRequest {
  baseURL: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  queryParams?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  maxAmountPerRequest?: number;
  paymentRequirements?: Array<Record<string, unknown>>;
}

type AgenticWalletResponse = {
  status: number;
  statusText?: string;
  data?: unknown;
  headers?: Record<string, string>;
};

function ensureIpcDirs(): void {
  if (!fs.existsSync(IPC_DIR)) fs.mkdirSync(IPC_DIR, { mode: 0o700 });
  if (!fs.existsSync(REQUESTS_DIR)) fs.mkdirSync(REQUESTS_DIR, { mode: 0o700 });
  if (!fs.existsSync(RESPONSES_DIR)) fs.mkdirSync(RESPONSES_DIR, { mode: 0o700 });
}

async function waitForResponseFile(filePath: string, timeoutMs: number): Promise<void> {
  if (fs.existsSync(filePath)) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      watcher.close();
      reject(new Error("Agentic Wallet IPC timeout"));
    }, timeoutMs);

    const watcher = fs.watch(RESPONSES_DIR, (eventType, filename) => {
      if (filename === path.basename(filePath)) {
        clearTimeout(timeout);
        watcher.close();
        resolve();
      }
    });
  });
}

export async function makeX402RequestViaAgenticWallet(
  request: AgenticWalletRequest,
  timeoutMs = 30_000
): Promise<AgenticWalletResponse> {
  ensureIpcDirs();

  const originalTitle = process.title;
  process.title = "awal-cli";

  const requestId = randomUUID();
  const requestFile = path.join(REQUESTS_DIR, `${requestId}.json`);
  const responseFile = path.join(RESPONSES_DIR, `${requestId}.json`);

  try {
    const payload = {
      id: requestId,
      channel: "make-x402-request",
      data: request,
      timestamp: Date.now(),
      pid: process.pid,
      processTitle: process.title,
    };

    fs.writeFileSync(requestFile, JSON.stringify(payload, null, 2), { mode: 0o600 });

    await waitForResponseFile(responseFile, timeoutMs);

    const responseData = fs.readFileSync(responseFile, "utf-8");
    const response = JSON.parse(responseData) as {
      result?: AgenticWalletResponse;
      error?: string | object;
    };

    try {
      fs.unlinkSync(responseFile);
    } catch {
      // ignore cleanup errors
    }

    if (response.error) {
      const message =
        typeof response.error === "string" ? response.error : JSON.stringify(response.error);
      throw new Error(message);
    }

    if (!response.result) {
      throw new Error("Agentic Wallet IPC returned empty result");
    }

    return response.result;
  } finally {
    process.title = originalTitle;
  }
}
