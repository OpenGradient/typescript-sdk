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

## Available models

See `TEE_LLM` for the supported models, including:

- `TEE_LLM.GPT_4O`, `TEE_LLM.GPT_4_1_2025_04_14`, `TEE_LLM.O4_MINI`
- `TEE_LLM.CLAUDE_3_5_HAIKU`, `TEE_LLM.CLAUDE_3_7_SONNET`, `TEE_LLM.CLAUDE_4_0_SONNET`
- `TEE_LLM.GEMINI_2_0_FLASH`, `TEE_LLM.GEMINI_2_5_FLASH`, `TEE_LLM.GEMINI_2_5_FLASH_LITE`, `TEE_LLM.GEMINI_2_5_PRO`
- `TEE_LLM.GROK_2_1212`, `TEE_LLM.GROK_2_VISION_LATEST`, `TEE_LLM.GROK_3_BETA`, `TEE_LLM.GROK_3_MINI_BETA`, `TEE_LLM.GROK_4_1_FAST`, `TEE_LLM.GROK_4_1_FAST_NON_REASONING`
