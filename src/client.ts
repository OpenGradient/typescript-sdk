import { privateKeyToAccount } from "viem/accounts";
import { LLM } from "./llm";
import { X402Client } from "./x402";
import { ClientConfig } from "./types";
import {
  DEFAULT_NETWORK_FILTER,
  DEFAULT_OPENGRADIENT_LLM_SERVER_URL,
  DEFAULT_OPENGRADIENT_LLM_STREAMING_SERVER_URL,
  DEFAULT_RPC_URL,
} from "./defaults";

/**
 * OpenGradient client.
 *
 * Provides access to LLM chat and completion via OpenGradient's TEE
 * (Trusted Execution Environment) with x402 payment protocol.
 *
 * Usage:
 *   const client = new Client({ privateKey: "0x..." });
 *   const result = await client.llm.chat({
 *     model: TEE_LLM.CLAUDE_3_5_HAIKU,
 *     messages: [{ role: "user", content: "Hello" }],
 *   });
 */
export class Client {
  readonly llm: LLM;

  constructor(config: ClientConfig) {
    const privateKey = (
      config.privateKey.startsWith("0x") ? config.privateKey : `0x${config.privateKey}`
    ) as `0x${string}`;
    const account = privateKeyToAccount(privateKey);

    const x402Client = new X402Client(
      account,
      config.rpcUrl ?? DEFAULT_RPC_URL,
      config.network ?? DEFAULT_NETWORK_FILTER,
    );

    this.llm = new LLM(
      x402Client,
      config.llmServerUrl ?? DEFAULT_OPENGRADIENT_LLM_SERVER_URL,
      config.llmStreamingServerUrl ?? DEFAULT_OPENGRADIENT_LLM_STREAMING_SERVER_URL,
    );
  }
}
