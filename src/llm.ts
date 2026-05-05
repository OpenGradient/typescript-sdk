import { createSigner, wrapFetchWithPayment } from "x402-fetch";
import {
  ChatParams,
  CompletionParams,
  OpenGradientError,
  StreamChoice,
  StreamChunk,
  TextGenerationOutput,
  X402SettlementMode,
} from "./types";

const X402_PLACEHOLDER_API_KEY =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const X402_PROCESSING_HASH_HEADER = "x-processing-hash";

export interface LLMConfig {
  privateKey: `0x${string}`;
  network: string;
  maxPaymentValue?: bigint;
  serverUrl: string;
  streamingServerUrl: string;
}

/**
 * LLM inference namespace.
 *
 * Provides chat and completion access to LLMs hosted in OpenGradient's TEE
 * (Trusted Execution Environment) with x402 payment protocol support.
 *
 * Usage:
 *   const client = new Client({ privateKey });
 *   const result = await client.llm.chat({
 *     model: TEE_LLM.CLAUDE_3_5_HAIKU,
 *     messages: [{ role: "user", content: "Hello" }],
 *   });
 */
export class LLM {
  private fetchWithPayment?: typeof fetch;

  constructor(private readonly config: LLMConfig) {}

  /**
   * Perform a (non-chat) completion via the TEE LLM server.
   */
  async completion(params: CompletionParams): Promise<TextGenerationOutput> {
    const {
      model,
      prompt,
      maxTokens = 100,
      stopSequence,
      temperature = 0.0,
      x402SettlementMode = X402SettlementMode.SETTLE_BATCH,
    } = params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {
      model: stripProvider(model),
      prompt,
      max_tokens: maxTokens,
      temperature,
    };
    if (stopSequence && stopSequence.length) payload.stop = stopSequence;

    const response = await this.post(
      `${trimSlash(this.config.serverUrl)}/v1/completions`,
      payload,
      x402SettlementMode,
    );

    const result = (await response.json()) as { completion?: string };
    return {
      transactionHash: "external",
      completionOutput: result.completion,
      paymentHash: response.headers.get(X402_PROCESSING_HASH_HEADER) ?? "",
    };
  }

  /**
   * Perform a non-streaming chat completion via the TEE LLM server.
   */
  chat(params: ChatParams & { stream?: false }): Promise<TextGenerationOutput>;
  /**
   * Perform a streaming chat completion via the TEE LLM server.
   */
  chat(params: ChatParams & { stream: true }): AsyncIterable<StreamChunk>;
  chat(
    params: ChatParams & { stream?: boolean },
  ): Promise<TextGenerationOutput> | AsyncIterable<StreamChunk> {
    if (params.stream) {
      return this.chatStream(params);
    }
    return this.chatNonStreaming(params);
  }

  private async chatNonStreaming(params: ChatParams): Promise<TextGenerationOutput> {
    const payload = this.buildChatPayload(params, false);
    const response = await this.post(
      `${trimSlash(this.config.serverUrl)}/v1/chat/completions`,
      payload,
      params.x402SettlementMode ?? X402SettlementMode.SETTLE_BATCH,
    );

    const result = (await response.json()) as {
      choices?: Array<{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        message?: any;
        finish_reason?: string;
      }>;
    };

    const choices = result.choices;
    if (!choices || choices.length === 0) {
      throw new OpenGradientError(
        `Invalid response: 'choices' missing or empty in ${JSON.stringify(result)}`,
      );
    }

    return {
      transactionHash: "external",
      finishReason: choices[0].finish_reason,
      chatOutput: choices[0].message,
      paymentHash: response.headers.get(X402_PROCESSING_HASH_HEADER) ?? "",
    };
  }

  private async *chatStream(params: ChatParams): AsyncIterable<StreamChunk> {
    const payload = this.buildChatPayload(params, true);
    const response = await this.post(
      `${trimSlash(this.config.streamingServerUrl)}/v1/chat/completions`,
      payload,
      params.x402SettlementMode ?? X402SettlementMode.SETTLE_BATCH,
    );

    if (!response.body) {
      throw new OpenGradientError("TEE LLM chat stream returned empty body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line || !line.startsWith("data: ")) continue;

          const dataStr = line.slice(6);
          if (dataStr === "[DONE]") return;

          try {
            const data = JSON.parse(dataStr);
            yield parseStreamChunk(data);
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildChatPayload(
    params: ChatParams,
    stream: boolean,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Record<string, any> {
    const {
      model,
      messages,
      maxTokens = 100,
      stopSequence,
      temperature = 0.0,
      tools,
      toolChoice,
    } = params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {
      model: stripProvider(model),
      messages,
      max_tokens: maxTokens,
      temperature,
    };
    if (stream) payload.stream = true;
    if (stopSequence && stopSequence.length) payload.stop = stopSequence;
    if (tools && tools.length) {
      payload.tools = tools;
      payload.tool_choice = toolChoice ?? "auto";
    }
    return payload;
  }

  private async getFetch(): Promise<typeof fetch> {
    if (!this.fetchWithPayment) {
      const signer = await createSigner(this.config.network, this.config.privateKey);
      this.fetchWithPayment = wrapFetchWithPayment(
        fetch,
        signer,
        this.config.maxPaymentValue,
      ) as typeof fetch;
    }
    return this.fetchWithPayment;
  }

  private async post(
    url: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: Record<string, any>,
    settlementMode: X402SettlementMode,
  ): Promise<Response> {
    const paidFetch = await this.getFetch();
    let response: Response;
    try {
      response = await paidFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${X402_PLACEHOLDER_API_KEY}`,
          "X-SETTLEMENT-TYPE": settlementMode,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new OpenGradientError(`TEE LLM request failed: ${String(e)}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new OpenGradientError(
        `TEE LLM request failed: HTTP ${response.status}${text ? ` - ${text}` : ""}`,
        response.status,
      );
    }
    return response;
  }
}

function stripProvider(model: string): string {
  const idx = model.indexOf("/");
  return idx === -1 ? model : model.slice(idx + 1);
}

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStreamChunk(data: any): StreamChunk {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const choices: StreamChoice[] = (data.choices ?? []).map((c: any) => ({
    delta: {
      content: c.delta?.content,
      role: c.delta?.role,
      tool_calls: c.delta?.tool_calls,
    },
    index: c.index ?? 0,
    finish_reason: c.finish_reason ?? null,
  }));

  const usage = data.usage
    ? {
        prompt_tokens: data.usage.prompt_tokens ?? 0,
        completion_tokens: data.usage.completion_tokens ?? 0,
        total_tokens: data.usage.total_tokens ?? 0,
      }
    : undefined;

  const is_final =
    choices.some((c) => c.finish_reason !== null && c.finish_reason !== undefined) ||
    !!usage;

  return {
    choices,
    model: data.model ?? "unknown",
    usage,
    is_final,
  };
}
