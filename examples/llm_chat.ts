// Run a non-streaming chat completion against a TEE-hosted LLM through
// OpenGradient with x402 payments.
//
// Run with: OG_PRIVATE_KEY=0x... npx ts-node examples/llm_chat.ts

import { Client, TEE_LLM, X402SettlementMode } from "../src";

async function main() {
  const privateKey = process.env.OG_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("OG_PRIVATE_KEY environment variable is not set");
  }

  const client = new Client({ privateKey });

  const messages = [
    { role: "user", content: "What is Python?" },
    { role: "assistant", content: "Python is a high-level programming language." },
    { role: "user", content: "What makes it good for beginners?" },
  ];

  const result = await client.llm.chat({
    model: TEE_LLM.GPT_4_1_2025_04_14,
    messages,
    x402SettlementMode: X402SettlementMode.INDIVIDUAL_FULL,
  });

  console.log(`Response: ${result.chatOutput?.content}`);
  console.log(`Payment hash: ${result.paymentHash ?? "(none)"}`);
  if (result.dataSettlementTransactionHash) {
    console.log(
      `Data settlement tx: ${result.dataSettlementTransactionHash}`,
    );
  }
  if (result.teeSignature) {
    console.log(`TEE signature: ${result.teeSignature.slice(0, 16)}…`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
