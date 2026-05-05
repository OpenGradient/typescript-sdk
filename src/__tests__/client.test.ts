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
    expect(TEE_LLM.CLAUDE_3_5_HAIKU).toBe("anthropic/claude-3.5-haiku");
    expect(TEE_LLM.GPT_4O).toBe("openai/gpt-4o");
  });

  it("exposes X402SettlementMode values matching the wire protocol", () => {
    expect(X402SettlementMode.SETTLE).toBe("settle");
    expect(X402SettlementMode.SETTLE_BATCH).toBe("settle-batch");
    expect(X402SettlementMode.SETTLE_METADATA).toBe("settle-metadata");
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
