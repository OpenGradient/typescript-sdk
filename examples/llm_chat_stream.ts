// Stream a chat completion from a TEE-hosted LLM through OpenGradient
// with x402 payments.
//
// Run with: OG_PRIVATE_KEY=0x... npx ts-node examples/llm_chat_stream.ts

import { Client, TEE_LLM, X402SettlementMode } from "../src";

async function main() {
  const privateKey = process.env.OG_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("OG_PRIVATE_KEY environment variable is not set");
  }

  const client = new Client({ privateKey });

  const messages = [
    { role: "user", content: "Describe to me the 7 network layers?" },
  ];

  const stream = client.llm.chat({
    model: TEE_LLM.GPT_4_1_2025_04_14,
    messages,
    x402SettlementMode: X402SettlementMode.INDIVIDUAL_FULL,
    stream: true,
    maxTokens: 1000,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta.content;
    if (content) process.stdout.write(content);
  }
  process.stdout.write("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
