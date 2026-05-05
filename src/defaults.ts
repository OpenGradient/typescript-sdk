/**
 * Default RPC URL for the chain hosting the on-chain TEE registry.
 */
export const DEFAULT_OG_RPC_URL = "https://ogevmdevnet.opengradient.ai";

/**
 * Default address of the on-chain TEERegistry contract used to discover
 * verified TEE LLM endpoints and their pinned TLS certificates.
 */
export const DEFAULT_TEE_REGISTRY_ADDRESS =
  "0x4e72238852f3c918f4E4e57AeC9280dDB0c80248";

/**
 * Default x402 settlement network. OpenGradient settles in OPG on Base.
 */
export const DEFAULT_NETWORK_FILTER = "base";

/**
 * Base URL for the OpenGradient faucet service.
 */
export const DEFAULT_OG_FAUCET_URL = "https://faucet.opengradient.ai/?address=";

/**
 * URL for signing up to the OpenGradient Hub.
 */
export const DEFAULT_HUB_SIGNUP_URL = "https://hub.opengradient.ai/signup";

/**
 * Base URL for the blockchain explorer.
 */
export const DEFAULT_BLOCKCHAIN_EXPLORER =
  "https://explorer.opengradient.ai/tx/";

export const getExplorerUrl = (txHash: string): string =>
  `${DEFAULT_BLOCKCHAIN_EXPLORER}${txHash}`;

export const getFaucetUrl = (address: string): string =>
  `${DEFAULT_OG_FAUCET_URL}${address}`;
