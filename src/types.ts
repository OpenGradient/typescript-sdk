/**
 * Settlement modes for x402 payment protocol transactions.
 *
 * These modes control how inference data is recorded on-chain for payment
 * settlement and auditability. Each mode offers different trade-offs between
 * data completeness, privacy, and transaction costs.
 *
 * - PRIVATE: Payment-only settlement. Only the payment is settled on-chain —
 *   no input or output hashes are posted. Inference data remains completely
 *   off-chain, ensuring maximum privacy.
 * - BATCH_HASHED: Batch settlement with hashes (default). Aggregates multiple
 *   inferences into a single settlement transaction using a Merkle tree
 *   containing input hashes, output hashes, and signatures. Most cost-efficient
 *   for high-volume applications.
 * - INDIVIDUAL_FULL: Individual settlement with full metadata. Records input
 *   data, output data, timestamp, and verification on-chain. Higher gas cost
 *   in exchange for maximum auditability.
 */
export enum X402SettlementMode {
  PRIVATE = "private",
  BATCH_HASHED = "batch",
  INDIVIDUAL_FULL = "individual",
}

/**
 * LLM models available for TEE (Trusted Execution Environment) execution.
 *
 * TEE mode provides cryptographic verification that inference was performed
 * correctly in a secure enclave.
 */
export enum TEE_LLM {
  // OpenAI models via TEE
  GPT_4_1_2025_04_14 = "openai/gpt-4.1-2025-04-14",
  GPT_4_1_MINI = "openai/gpt-4.1-mini",
  GPT_4_1_NANO = "openai/gpt-4.1-nano",
  O3 = "openai/o3",
  O4_MINI = "openai/o4-mini",
  GPT_5 = "openai/gpt-5",
  GPT_5_MINI = "openai/gpt-5-mini",
  GPT_5_2 = "openai/gpt-5.2",
  GPT_5_4 = "openai/gpt-5.4",
  GPT_5_4_MINI = "openai/gpt-5.4-mini",
  GPT_5_4_NANO = "openai/gpt-5.4-nano",
  GPT_5_5 = "openai/gpt-5.5",

  // Anthropic models via TEE
  CLAUDE_SONNET_4_5 = "anthropic/claude-sonnet-4-5",
  CLAUDE_SONNET_4_6 = "anthropic/claude-sonnet-4-6",
  CLAUDE_HAIKU_4_5 = "anthropic/claude-haiku-4-5",
  CLAUDE_OPUS_4_5 = "anthropic/claude-opus-4-5",
  CLAUDE_OPUS_4_6 = "anthropic/claude-opus-4-6",
  CLAUDE_OPUS_4_7 = "anthropic/claude-opus-4-7",

  // Google models via TEE
  // Note: gemini-2.5-flash, gemini-2.5-pro, and gemini-2.5-flash-lite are
  // scheduled for deprecation on June 17, 2026 (flash-lite: July 22, 2026).
  // Use the Gemini 3 replacements below for new integrations.
  GEMINI_2_5_FLASH = "google/gemini-2.5-flash",
  GEMINI_2_5_PRO = "google/gemini-2.5-pro",
  GEMINI_2_5_FLASH_LITE = "google/gemini-2.5-flash-lite",
  GEMINI_3_FLASH = "google/gemini-3-flash-preview",
  GEMINI_3_1_PRO_PREVIEW = "google/gemini-3.1-pro-preview",
  GEMINI_3_1_FLASH_LITE_PREVIEW = "google/gemini-3.1-flash-lite-preview",

  // xAI Grok models via TEE
  GROK_4 = "x-ai/grok-4",
  GROK_4_FAST = "x-ai/grok-4-fast",
  GROK_4_1_FAST = "x-ai/grok-4-1-fast",
  GROK_4_1_FAST_NON_REASONING = "x-ai/grok-4-1-fast-non-reasoning",
  GROK_4_20_REASONING = "x-ai/grok-4.20-reasoning",
  GROK_4_20_NON_REASONING = "x-ai/grok-4.20-non-reasoning",
  GROK_CODE_FAST_1 = "x-ai/grok-code-fast-1",

  // ByteDance Seed models via TEE (BytePlus ModelArk)
  SEED_1_6 = "bytedance/seed-1.6",
  SEED_1_8 = "bytedance/seed-1.8",
  SEED_2_0_LITE = "bytedance/seed-2.0-lite",
}

export interface ChatMessage {
  role: string;
  content?: string | null;
  name?: string;

  /** OpenAI-style tool calls. Snake-case to match the wire format. */
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface ToolFunction {
  name: string;
  description?: string;

  parameters?: Record<string, any>;
}

export interface Tool {
  type?: "function";
  function: ToolFunction;
}

/**
 * Controls the output format enforced by the TEE gateway.
 *
 * Use `type: "json_object"` to receive any valid JSON object (supported by
 * OpenAI, Gemini, and Grok). Use `type: "json_schema"` with a `jsonSchema`
 * definition to enforce a specific schema (supported by all providers,
 * including Anthropic).
 */
export interface ResponseFormat {
  type: "text" | "json_object" | "json_schema";
  /** Required when `type` is `"json_schema"`. Must contain `name` and `schema`. */
  jsonSchema?: {
    name: string;
    schema: Record<string, any>;
    strict?: boolean;
  };
}

export interface CompletionParams {
  model: TEE_LLM;
  prompt: string;
  maxTokens?: number;
  stopSequence?: string[];
  temperature?: number;
  x402SettlementMode?: X402SettlementMode;
}

export interface ChatParams {
  model: TEE_LLM;
  messages: ChatMessage[];
  maxTokens?: number;
  stopSequence?: string[];
  temperature?: number;
  tools?: Tool[];
  toolChoice?: string;
  responseFormat?: ResponseFormat;
  x402SettlementMode?: X402SettlementMode;
}

/** Token usage for a single LLM response. */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Output from a non-streaming `chat()` or `completion()` call.
 *
 * For chat requests the response is in `chatOutput`; for completion requests
 * it is in `completionOutput`. Only the field matching the request type will
 * be populated.
 *
 * Every response includes a `teeSignature` and `teeTimestamp` that can be used
 * to cryptographically verify the inference was performed inside a TEE
 * enclave.
 */
export interface TextGenerationOutput {
  /**
   * Blockchain transaction hash for the data settlement transaction.
   * `undefined` when the provider does not return data settlement metadata.
   */
  dataSettlementTransactionHash?: string;
  /**
   * Walrus blob ID for individual data settlement. `undefined` for
   * private/batch settlement or when the provider does not return it.
   */
  dataSettlementBlobId?: string;
  /**
   * Reason the model stopped generating (e.g. `"stop"`, `"tool_calls"`,
   * `"error"`). Only populated for chat requests.
   */
  finishReason?: string;
  /**
   * Assistant message returned by a chat request. Contains `role`, `content`,
   * and optionally `tool_calls`.
   */
  chatOutput?: ChatMessage;
  /** Raw text returned by a completion request. */
  completionOutput?: string;
  /**
   * Token usage for the request. Contains `prompt_tokens`,
   * `completion_tokens`, and `total_tokens` when reported by the server.
   */
  usage?: TokenUsage;
  /** Payment hash for the x402 transaction. */
  paymentHash?: string;
  /** RSA-PSS signature over the response produced by the TEE enclave. */
  teeSignature?: string;
  /** ISO-8601 timestamp from the TEE at signing time. */
  teeTimestamp?: string;
  /**
   * On-chain TEE registry ID (keccak256 of the enclave's public key) of the
   * TEE that served this request.
   */
  teeId?: string;
  /** Endpoint URL of the TEE that served this request, as registered on-chain. */
  teeEndpoint?: string;
  /** Payment address registered for the TEE that served this request. */
  teePaymentAddress?: string;
}

export interface StreamDelta {
  content?: string;
  role?: string;

  /** OpenAI-style tool calls. Snake-case to match the wire format. */
  tool_calls?: any[];
}

export interface StreamChoice {
  delta: StreamDelta;
  index: number;
  finish_reason?: string | null;
}

/**
 * A single chunk in a streaming LLM response (OpenAI-style SSE format).
 *
 * The final chunk additionally carries TEE attestation fields and any data
 * settlement metadata that arrived with the response.
 */
export interface StreamChunk {
  choices: StreamChoice[];
  model: string;
  usage?: TokenUsage;
  isFinal: boolean;

  /** RSA-PSS signature over the response, present on the final chunk. */
  teeSignature?: string;
  /** ISO-8601 TEE timestamp at signing time, present on the final chunk. */
  teeTimestamp?: string;
  /** On-chain TEE registry ID of the enclave serving the request (final chunk). */
  teeId?: string;
  /** Endpoint URL of the TEE that served this request (final chunk). */
  teeEndpoint?: string;
  /** Payment address registered for the TEE (final chunk). */
  teePaymentAddress?: string;
  /** Transaction hash for the data settlement transaction, when available. */
  dataSettlementTransactionHash?: string;
  /** Walrus blob ID for individual data settlement, when available. */
  dataSettlementBlobId?: string;
}

export interface ClientConfig {
  /** EVM private key (hex string, with or without 0x prefix). */
  privateKey: string;
  /**
   * Override with a hardcoded TEE LLM server URL (dev / self-hosted). When
   * set, the on-chain TEE registry is bypassed and TLS verification is
   * disabled. Leave unset to discover an active TEE via the registry with
   * its TLS certificate pinned to the registered value.
   */
  llmServerUrl?: string;
  /**
   * Maximum payment amount in atomic units the client will authorize per
   * request. Defaults to the x402-fetch default (0.10 USDC, i.e. `100_000n`).
   */
  maxPaymentValue?: bigint;
  /** Override the RPC URL used to query the on-chain TEE registry. */
  rpcUrl?: string;
  /** Override the deployed TEERegistry contract address. */
  teeRegistryAddress?: string;
}

export class OpenGradientError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "OpenGradientError";
    this.statusCode = statusCode;
  }
}
