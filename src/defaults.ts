/**
 * Default OpenGradient TEE LLM server URL.
 */
export const DEFAULT_OPENGRADIENT_LLM_SERVER_URL = "https://llmogevm.opengradient.ai";

/**
 * Default OpenGradient TEE LLM streaming server URL.
 */
export const DEFAULT_OPENGRADIENT_LLM_STREAMING_SERVER_URL = "https://llmogevm.opengradient.ai";

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
export const DEFAULT_BLOCKCHAIN_EXPLORER = "https://explorer.opengradient.ai/tx/";

export const getExplorerUrl = (txHash: string): string =>
  `${DEFAULT_BLOCKCHAIN_EXPLORER}${txHash}`;

export const getFaucetUrl = (address: string): string =>
  `${DEFAULT_OG_FAUCET_URL}${address}`;
