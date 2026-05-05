# OpenGradient TypeScript SDK

A TypeScript/JavaScript SDK for performing LLM chat and completion via OpenGradient's TEE (Trusted Execution Environment) with [x402](https://x402.org) payment protocol support.

## Installation

```bash
npm install opengradient-sdk
```

## Requirements

- Node.js 18+ (for global `fetch`)
- A funded EVM wallet on Base (settlement happens in OPG on the Base network via [x402](https://x402.org))

## Quick Start

```typescript
import { Client, TEE_LLM } from "opengradient-sdk";

const client = new Client({
  privateKey: process.env.PRIVATE_KEY!, // EVM private key (with or without 0x prefix)
});

// Non-streaming chat
const result = await client.llm.chat({
  model: TEE_LLM.CLAUDE_3_5_HAIKU,
  messages: [{ role: "user", content: "Hello!" }],
  maxTokens: 100,
});
console.log(result.chatOutput?.content);
console.log("payment hash:", result.paymentHash);
```

### Streaming chat

```typescript
import { Client, TEE_LLM } from "opengradient-sdk";

const client = new Client({ privateKey: process.env.PRIVATE_KEY! });

const stream = client.llm.chat({
  model: TEE_LLM.CLAUDE_3_5_HAIKU,
  messages: [{ role: "user", content: "Stream me a haiku." }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta.content ?? "");
}
```

### Tool / function calling

```typescript
const result = await client.llm.chat({
  model: TEE_LLM.GPT_4O,
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get current weather for a city",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    },
  ],
});
console.log(result.chatOutput?.tool_calls);
```

### Completion

```typescript
const result = await client.llm.completion({
  model: TEE_LLM.CLAUDE_3_5_HAIKU,
  prompt: "The capital of France is",
  maxTokens: 20,
});
console.log(result.completionOutput);
```

## OPG Token Approval

Before making LLM requests, your wallet must approve OPG token spending via the [Permit2](https://github.com/Uniswap/permit2) protocol. `ensureOpgApproval` only sends an on-chain transaction when the current allowance drops below the threshold, so it's safe to call on every server startup:

```typescript
import { privateKeyToAccount } from "viem/accounts";
import { ensureOpgApproval } from "opengradient-sdk";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

// Only sends a tx when allowance < 5 OPG, then approves 100 OPG so
// subsequent restarts are free. Defaults approveAmount to 2 * minAllowance.
const result = await ensureOpgApproval(account, 5, 100);
console.log("allowance after:", result.allowanceAfter, "tx:", result.txHash);
```

The wallet must hold OPG on Base mainnet. Override the RPC with the `BASE_MAINNET_RPC` environment variable if you don't want to use the default public node.

### End-to-end example

```typescript
import { privateKeyToAccount } from "viem/accounts";
import { Client, TEE_LLM, ensureOpgApproval } from "opengradient-sdk";

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;

  // 1. Make sure the wallet has approved Permit2 to spend OPG.
  //    No-op when the allowance is already above the threshold.
  const account = privateKeyToAccount(privateKey);
  await ensureOpgApproval(account, 5, 100);

  // 2. Run a TEE-secured chat completion settled in OPG via x402.
  const client = new Client({ privateKey });
  try {
    const result = await client.llm.chat({
      model: TEE_LLM.CLAUDE_3_5_HAIKU,
      messages: [{ role: "user", content: "Hello!" }],
      maxTokens: 100,
    });
    console.log(result.chatOutput?.content);
    console.log("payment hash:", result.paymentHash);
  } finally {
    await client.close();
  }
}

main();
```

## x402 Settlement Modes

```typescript
import { X402SettlementMode } from "opengradient-sdk";

await client.llm.chat({
  model: TEE_LLM.GPT_4O,
  messages: [{ role: "user", content: "Hi" }],
  x402SettlementMode: X402SettlementMode.SETTLE_BATCH, // default
});
```

- `SETTLE` — records input/output hashes only (most privacy-preserving).
- `SETTLE_METADATA` — records full model info, complete input/output, and metadata.
- `SETTLE_BATCH` — aggregates multiple inferences into a single on-chain settlement (most cost-efficient, default).

## Development

```bash
npm install      # install deps
npm run lint     # ESLint over src/
npm test         # Jest unit tests
npm run build    # tsc → dist/
npm run format   # prettier --write
```

CI runs `lint`, `test`, and `build` on Node 18 and 20 — see `.github/workflows/ci.yml`.

## Available models

See `TEE_LLM` for the supported models, including:

- `TEE_LLM.GPT_4O`, `TEE_LLM.GPT_4_1_2025_04_14`, `TEE_LLM.O4_MINI`
- `TEE_LLM.CLAUDE_3_5_HAIKU`, `TEE_LLM.CLAUDE_3_7_SONNET`, `TEE_LLM.CLAUDE_4_0_SONNET`
- `TEE_LLM.GEMINI_2_0_FLASH`, `TEE_LLM.GEMINI_2_5_FLASH`, `TEE_LLM.GEMINI_2_5_FLASH_LITE`, `TEE_LLM.GEMINI_2_5_PRO`
- `TEE_LLM.GROK_2_1212`, `TEE_LLM.GROK_2_VISION_LATEST`, `TEE_LLM.GROK_3_BETA`, `TEE_LLM.GROK_3_MINI_BETA`, `TEE_LLM.GROK_4_1_FAST`, `TEE_LLM.GROK_4_1_FAST_NON_REASONING`
