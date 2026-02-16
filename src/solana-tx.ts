import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import type { Keypair } from "@solana/web3.js";

export async function signAndSendVersionedTx(
  connection: Connection,
  txBase64: string,
  signer: Keypair
): Promise<string> {
  if (process.env.ONELY_SOLANA_DRY_RUN === "1") {
    return "SIMULATED_TX_SIGNATURE";
  }
  const tx = VersionedTransaction.deserialize(Buffer.from(txBase64, "base64"));
  tx.sign([signer]);
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

export async function signAndSendLegacyTx(
  connection: Connection,
  txBase64: string,
  signer: Keypair
): Promise<string> {
  if (process.env.ONELY_SOLANA_DRY_RUN === "1") {
    return "SIMULATED_TX_SIGNATURE";
  }
  const tx = Transaction.from(Buffer.from(txBase64, "base64"));
  const signature = await connection.sendTransaction(tx, [signer], {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}
