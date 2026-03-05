/**
 * 1ly_vault_status - Check wallet/vault provider status
 *
 * Remote-aware: reports connection state (connected | offline | locked)
 */

import { getProvider, checkDcpStatus } from "../provider/index.js";
import { DcpRemoteProvider } from "../provider/dcp-remote.js";
import { mcpOk, mcpError } from "../mcp.js";

export const vaultStatusSchema = {
  name: "1ly_vault_status",
  description:
    "Check the status of the wallet/vault provider. Returns provider type, connection state (connected/offline/locked), and wallet addresses.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [] as string[],
  },
};

export type ConnectionState = "connected" | "offline" | "locked";

export async function handleVaultStatus() {
  try {
    const provider = await getProvider();
    const isAvailable = await provider.isAvailable();

    // Determine connection state
    let connectionState: ConnectionState = "offline";
    if (isAvailable) {
      connectionState = "connected";
    } else if (provider.type === "dcp-local") {
      // Check if DCP is locked vs not running
      const dcpStatus = await checkDcpStatus();
      connectionState = dcpStatus === "locked" ? "locked" : "offline";
    } else if (provider.type === "dcp-remote") {
      // For remote, check the connection state
      const remoteProvider = provider as DcpRemoteProvider;
      const state = remoteProvider.getConnectionState();
      connectionState = state === "connected" ? "connected" : "offline";
    }

    const status: Record<string, unknown> = {
      provider: provider.type,
      connectionState,
      available: isAvailable,
    };

    // Add addresses if available
    if (isAvailable) {
      try {
        status.solanaAddress = await provider.getPublicAddress("solana");
      } catch {
        status.solanaAddress = null;
      }

      try {
        status.evmAddress = await provider.getPublicAddress("evm");
      } catch {
        status.evmAddress = null;
      }
    }

    // Add DCP-specific details
    if (provider.type === "dcp-local") {
      const dcpStatus = await checkDcpStatus();
      status.dcpStatus = dcpStatus;
    } else if (provider.type === "dcp-remote") {
      const remoteProvider = provider as DcpRemoteProvider;
      status.vaultId = remoteProvider.getVaultId();
      status.relayState = remoteProvider.getConnectionState();
    }

    return mcpOk(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return mcpError(message, { code: "UNKNOWN_ERROR" });
  }
}
