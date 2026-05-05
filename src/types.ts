/**
 * Settlement modes for x402 payment protocol transactions.
 *
 * Controls how inference data is recorded on-chain for payment settlement.
 *
 * - SETTLE: Records input/output hashes only (most privacy-preserving).
 * - SETTLE_METADATA: Records full model info, complete input/output data, and metadata.
 * - SETTLE_BATCH: Aggregates multiple inferences into batch hashes (most cost-efficient).
 */
export enum X402SettlementMode {
  SETTLE = "settle",
  SETTLE_METADATA = "settle-metadata",
  SETTLE_BATCH = "settle-batch",
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
  GPT_4O = "openai/gpt-4o",
  O4_MINI = "openai/o4-mini",

  // Anthropic models via TEE
  CLAUDE_3_7_SONNET = "anthropic/claude-3.7-sonnet",
  CLAUDE_3_5_HAIKU = "anthropic/claude-3.5-haiku",
  CLAUDE_4_0_SONNET = "anthropic/claude-4.0-sonnet",

  // Google models via TEE
  GEMINI_2_5_FLASH = "google/gemini-2.5-flash",
  GEMINI_2_5_PRO = "google/gemini-2.5-pro",
  GEMINI_2_0_FLASH = "google/gemini-2.0-flash",
  GEMINI_2_5_FLASH_LITE = "google/gemini-2.5-flash-lite",

  // xAI Grok models via TEE
  GROK_3_MINI_BETA = "x-ai/grok-3-mini-beta",
  GROK_3_BETA = "x-ai/grok-3-beta",
  GROK_2_1212 = "x-ai/grok-2-1212",
  GROK_2_VISION_LATEST = "x-ai/grok-2-vision-latest",
  GROK_4_1_FAST = "x-ai/grok-4.1-fast",
  GROK_4_1_FAST_NON_REASONING = "x-ai/grok-4-1-fast-non-reasoning",
}

export interface ChatMessage {
  role: string;
  content?: string | null;
  name?: string;

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
  x402SettlementMode?: X402SettlementMode;
}

/**
 * Output structure for non-streaming text generation requests.
 */
export interface TextGenerationOutput {
  /** Blockchain transaction hash. "external" for TEE provider responses. */
  transactionHash: string;
  /** Reason for completion (e.g. 'stop', 'tool_calls'). */
  finishReason?: string;
  /** Chat response message containing role, content, tool calls, etc. */
  chatOutput?: ChatMessage;
  /** Raw text output from completion-style generation. */
  completionOutput?: string;
  /** x402 payment hash returned by the server. */
  paymentHash?: string;
}

export interface StreamDelta {
  content?: string;
  role?: string;

  tool_calls?: any[];
}

export interface StreamChoice {
  delta: StreamDelta;
  index: number;
  finish_reason?: string | null;
}

export interface StreamUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * A single chunk in a streaming LLM response (OpenAI-style SSE format).
 */
export interface StreamChunk {
  choices: StreamChoice[];
  model: string;
  usage?: StreamUsage;
  is_final: boolean;
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
  /** Override the x402 settlement network. Defaults to `base`. */
  network?: string;
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
