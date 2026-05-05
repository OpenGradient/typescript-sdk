export { Client } from "./client";
export { LLM } from "./llm";

export { TEE_LLM, X402SettlementMode, OpenGradientError } from "./types";

export type {
  ChatMessage,
  ChatParams,
  ClientConfig,
  CompletionParams,
  ResponseFormat,
  StreamChoice,
  StreamChunk,
  StreamDelta,
  TextGenerationOutput,
  TokenUsage,
  Tool,
  ToolFunction,
} from "./types";

export {
  TEERegistry,
  TEE_TYPE_LLM_PROXY,
  TEE_TYPE_VALIDATOR,
} from "./teeRegistry";
export type { TEEEndpoint } from "./teeRegistry";

export {
  RegistryTEEConnection,
  StaticTEEConnection,
  buildPinnedAgent,
} from "./teeConnection";
export type { ActiveTEE, TEEConnection } from "./teeConnection";

export {
  DEFAULT_NETWORK_FILTER,
  DEFAULT_OG_RPC_URL,
  DEFAULT_TEE_REGISTRY_ADDRESS,
  DEFAULT_OG_FAUCET_URL,
  DEFAULT_HUB_SIGNUP_URL,
  DEFAULT_BLOCKCHAIN_EXPLORER,
  getExplorerUrl,
  getFaucetUrl,
} from "./defaults";
