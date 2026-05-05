import { Agent } from "undici";
import {
  TEE_TYPE_LLM_PROXY,
  TEERegistry,
  type TEEEndpoint,
} from "./teeRegistry";

/** Snapshot of the currently connected TEE. */
export interface ActiveTEE {
  endpoint: string;
  /**
   * Undici dispatcher pinned to the TEE's TLS certificate (or to skip
   * verification for static/self-hosted endpoints). Pass via the `dispatcher`
   * init option to `fetch`.
   */
  dispatcher: Agent;
  teeId?: string;
  paymentAddress?: string;
}

function derToPem(der: Uint8Array): string {
  const b64 = Buffer.from(der).toString("base64");
  const wrapped = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----\n`;
}

/**
 * Build an undici Agent that trusts *only* the given DER-encoded certificate.
 *
 * Hostname verification is disabled because TEE servers are typically
 * addressed by IP while the cert may be issued for a different hostname; the
 * pinned certificate itself is the trust anchor.
 */
export function buildPinnedAgent(der: Uint8Array): Agent {
  const pem = derToPem(der);
  return new Agent({
    connect: {
      ca: pem,
      rejectUnauthorized: true,
      // Skip hostname check — the pinned cert is the trust anchor.
      checkServerIdentity: () => undefined,
    },
  });
}

/** Common interface for static and registry-backed TEE connections. */
export interface TEEConnection {
  /**
   * Resolve the active TEE, performing any required network/registry lookups.
   * Safe to call repeatedly; idempotent after the first successful call.
   */
  ensureConnected(): Promise<ActiveTEE>;
  /** Force a fresh resolution of the TEE (e.g. after a connection failure). */
  reconnect(): Promise<void>;
  /** Start the optional background TEE refresh loop, if applicable. */
  ensureRefreshLoop(): void;
  /** Tear down all dispatchers and timers. */
  close(): Promise<void>;
}

/** Re-resolve TEE from the registry every 5 minutes. */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * TEE connection with a hardcoded endpoint URL.
 *
 * No registry lookup, no background refresh. TLS certificate verification is
 * disabled because self-hosted TEE servers typically use self-signed certs.
 */
export class StaticTEEConnection implements TEEConnection {
  private active: ActiveTEE;

  constructor(endpoint: string) {
    this.active = {
      endpoint,
      dispatcher: new Agent({ connect: { rejectUnauthorized: false } }),
    };
  }

  async ensureConnected(): Promise<ActiveTEE> {
    return this.active;
  }

  ensureRefreshLoop(): void {
    /* no-op — static connections don't refresh */
  }

  async reconnect(): Promise<void> {
    const old = this.active.dispatcher;
    this.active = {
      endpoint: this.active.endpoint,
      dispatcher: new Agent({ connect: { rejectUnauthorized: false } }),
    };
    try {
      await old.close();
    } catch {
      /* ignore */
    }
  }

  async close(): Promise<void> {
    try {
      await this.active.dispatcher.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * TEE connection resolved from the on-chain registry.
 *
 * Handles TLS certificate pinning and (optional) background health checks
 * with automatic failover when the current TEE becomes unavailable.
 */
export class RegistryTEEConnection implements TEEConnection {
  private active: ActiveTEE | null = null;
  /** In-flight connect promise, used to dedupe concurrent resolves. */
  private connecting: Promise<ActiveTEE> | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(private readonly registry: TEERegistry) {}

  async ensureConnected(): Promise<ActiveTEE> {
    if (this.active) return this.active;
    if (!this.connecting) this.connecting = this.connect();
    try {
      this.active = await this.connecting;
      return this.active;
    } finally {
      this.connecting = null;
    }
  }

  async reconnect(): Promise<void> {
    if (this.closed) return;
    // Coalesce concurrent reconnect attempts onto a single resolution.
    if (!this.connecting) this.connecting = this.connect();
    const old = this.active?.dispatcher;
    try {
      this.active = await this.connecting;
    } finally {
      this.connecting = null;
    }
    if (old && old !== this.active.dispatcher) {
      try {
        await old.close();
      } catch {
        /* ignore */
      }
    }
  }

  ensureRefreshLoop(): void {
    if (this.refreshTimer || this.closed) return;
    this.refreshTimer = setInterval(() => {
      void this.runHealthCheck();
    }, REFRESH_INTERVAL_MS);
    if (typeof this.refreshTimer.unref === "function") {
      this.refreshTimer.unref();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    try {
      await this.active?.dispatcher.close();
    } catch {
      /* ignore */
    }
  }

  private async connect(): Promise<ActiveTEE> {
    let tee: TEEEndpoint | null;
    try {
      tee = await this.registry.getLLMTEE();
    } catch (e) {
      throw new Error(
        `Failed to fetch LLM TEE endpoint from registry: ${String(e)}`,
      );
    }
    if (!tee) {
      throw new Error("No active LLM proxy TEE found in the registry.");
    }
    return {
      endpoint: tee.endpoint,
      dispatcher: buildPinnedAgent(tee.tlsCertDer),
      teeId: tee.teeId,
      paymentAddress: tee.paymentAddress,
    };
  }

  private async runHealthCheck(): Promise<void> {
    if (!this.active || this.closed) return;
    try {
      const tees = await this.registry.getActiveTEEsByType(TEE_TYPE_LLM_PROXY);
      if (tees.some((t) => t.teeId === this.active!.teeId)) return;
      await this.reconnect();
    } catch {
      /* swallow & retry next cycle */
    }
  }
}
