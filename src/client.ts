import { LLM } from "./llm";
import { ClientConfig } from "./types";
import {
  DEFAULT_NETWORK_FILTER,
  DEFAULT_OPENGRADIENT_LLM_SERVER_URL,
  DEFAULT_OPENGRADIENT_LLM_STREAMING_SERVER_URL,
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

    this.llm = new LLM({
      privateKey,
      network: config.network ?? DEFAULT_NETWORK_FILTER,
      maxPaymentValue: config.maxPaymentValue,
      serverUrl: config.llmServerUrl ?? DEFAULT_OPENGRADIENT_LLM_SERVER_URL,
      streamingServerUrl:
        config.llmStreamingServerUrl ?? DEFAULT_OPENGRADIENT_LLM_STREAMING_SERVER_URL,
    });
  }
}
