import {
  Client,
  TEE_LLM,
  X402SettlementMode,
  OpenGradientError,
  DEFAULT_NETWORK_FILTER,
} from "../index";

describe("Client construction", () => {
  // 32-byte hex key, valid for viem's privateKeyToAccount.
  const PRIVATE_KEY = `0x${"a".repeat(64)}`;

  it("accepts a 0x-prefixed private key", () => {
    const client = new Client({ privateKey: PRIVATE_KEY });
    expect(client.llm).toBeDefined();
  });

  it("accepts a private key without 0x prefix", () => {
    const client = new Client({ privateKey: "a".repeat(64) });
    expect(client.llm).toBeDefined();
  });
});

describe("Public exports", () => {
  it("exposes TEE_LLM models with provider/model format", () => {
    expect(TEE_LLM.CLAUDE_HAIKU_4_5).toBe("anthropic/claude-haiku-4-5");
    expect(TEE_LLM.GPT_5).toBe("openai/gpt-5");
    expect(TEE_LLM.GEMINI_3_FLASH).toBe("google/gemini-3-flash-preview");
    expect(TEE_LLM.GROK_4).toBe("x-ai/grok-4");
  });

  it("exposes X402SettlementMode values matching the wire protocol", () => {
    expect(X402SettlementMode.PRIVATE).toBe("private");
    expect(X402SettlementMode.BATCH_HASHED).toBe("batch");
    expect(X402SettlementMode.INDIVIDUAL_FULL).toBe("individual");
  });

  it("defaults the settlement network to base", () => {
    expect(DEFAULT_NETWORK_FILTER).toBe("base");
  });

  it("OpenGradientError preserves status code", () => {
    const err = new OpenGradientError("boom", 402);
    expect(err.name).toBe("OpenGradientError");
    expect(err.statusCode).toBe(402);
  });
});
