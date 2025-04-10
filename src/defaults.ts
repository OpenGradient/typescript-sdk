// src/defaults.ts

/**
 * Default RPC URL for the OpenGradient blockchain
 */
export const DEFAULT_RPC_URL = "https://eth-devnet.opengradient.ai";

/**
 * Default API URL for the OpenGradient blockchain
 */
export const DEFAULT_API_URL = "https://sdk-devnet.opengradient.ai";

/**
 * Base URL for the OpenGradient faucet service
 * Append wallet address to this URL to request tokens
 */
export const DEFAULT_OG_FAUCET_URL = "https://faucet.opengradient.ai/?address=";

/**
 * URL for signing up to the OpenGradient Hub
 */
export const DEFAULT_HUB_SIGNUP_URL = "https://hub.opengradient.ai/signup";

/**
 * Default smart contract address for inference operations
 */
export const DEFAULT_INFERENCE_CONTRACT_ADDRESS =
  "0x8383C9bD7462F12Eb996DD02F78234C0421A6FaE";

/**
 * Base URL for the blockchain explorer
 * Append transaction hash to this URL to view transaction details
 */
export const DEFAULT_BLOCKCHAIN_EXPLORER =
  "https://explorer.opengradient.ai/tx/";

/**
 * Default host address for the image generation service
 */
export const DEFAULT_IMAGE_GEN_HOST = "18.217.25.69";

/**
 * Default port for the image generation service
 */
export const DEFAULT_IMAGE_GEN_PORT = 5125;

/**
 * Helper function to get the explorer URL for a transaction
 * @param txHash - The transaction hash
 * @returns The complete explorer URL for the transaction
 */
export const getExplorerUrl = (txHash: string): string => {
  return `${DEFAULT_BLOCKCHAIN_EXPLORER}${txHash}`;
};

/**
 * Helper function to get the faucet URL for an address
 * @param address - The wallet address
 * @returns The complete faucet URL for the address
 */
export const getFaucetUrl = (address: string): string => {
  return `${DEFAULT_OG_FAUCET_URL}${address}`;
};

// Export a default configuration object
export const DEFAULT_CONFIG = {
  rpcUrl: DEFAULT_RPC_URL,
  apiUrl: DEFAULT_API_URL,
  inferenceContractAddress: DEFAULT_INFERENCE_CONTRACT_ADDRESS,
  imageGenHost: DEFAULT_IMAGE_GEN_HOST,
  imageGenPort: DEFAULT_IMAGE_GEN_PORT,
} as const;

// Type for the default configuration
export type DefaultConfig = typeof DEFAULT_CONFIG;
