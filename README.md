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
  model: TEE_LLM.CLAUDE_HAIKU_4_5,
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
  model: TEE_LLM.CLAUDE_HAIKU_4_5,
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
  model: TEE_LLM.GPT_5,
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
  model: TEE_LLM.CLAUDE_HAIKU_4_5,
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
  model: TEE_LLM.GPT_5,
  messages: [{ role: "user", content: "Hi" }],
  x402SettlementMode: X402SettlementMode.BATCH_HASHED, // default
});
```

- `PRIVATE` — payment-only settlement; no input/output hashes posted on-chain (most privacy-preserving).
- `BATCH_HASHED` — aggregates multiple inferences into a single Merkle-tree settlement of input/output hashes (most cost-efficient, default).
- `INDIVIDUAL_FULL` — records full input data, output data, and verification on-chain per request (highest gas, maximum auditability).

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

See `TEE_LLM` in `src/types.ts` for the full list. Highlights:

- **OpenAI**: `GPT_5`, `GPT_5_MINI`, `GPT_5_2`, `GPT_5_4`, `GPT_5_4_MINI`, `GPT_5_4_NANO`, `GPT_5_5`, `GPT_4_1_2025_04_14`, `GPT_4_1_MINI`, `GPT_4_1_NANO`, `O3`, `O4_MINI`
- **Anthropic**: `CLAUDE_HAIKU_4_5`, `CLAUDE_SONNET_4_5`, `CLAUDE_SONNET_4_6`, `CLAUDE_OPUS_4_5`, `CLAUDE_OPUS_4_6`, `CLAUDE_OPUS_4_7`
- **Google**: `GEMINI_3_FLASH`, `GEMINI_3_1_PRO_PREVIEW`, `GEMINI_3_1_FLASH_LITE_PREVIEW`, `GEMINI_2_5_FLASH`, `GEMINI_2_5_PRO`, `GEMINI_2_5_FLASH_LITE`
- **xAI**: `GROK_4`, `GROK_4_FAST`, `GROK_4_1_FAST`, `GROK_4_1_FAST_NON_REASONING`, `GROK_4_20_REASONING`, `GROK_4_20_NON_REASONING`, `GROK_CODE_FAST_1`
- **ByteDance**: `SEED_1_6`, `SEED_1_8`, `SEED_2_0_LITE`
