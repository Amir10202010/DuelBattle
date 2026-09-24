import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Card payments on the web, through Stripe Checkout.
 *
 * Two calls and no SDK. The browser is sent to a page Stripe hosts, so no card
 * number ever touches this server; Stripe then tells us — in a webhook signed
 * with a secret only the two of us know — that a session was paid. Nothing is
 * delivered on the redirect back, because a redirect is a claim made by a
 * browser, and nothing is delivered for an event whose signature does not
 * check out.
 *
 * With no secret key configured the gateway reports itself unavailable and the
 * store simply does not offer card prices, exactly as the rest of the game
 * behaves without an AI key or a bot token.
 */

export interface CheckoutRequest {
  orderId: string;
  name: string;
  description: string;
  usdCents: number;
  successUrl: string;
  cancelUrl: string;
}

export interface StripeSession {
  id: string;
  payment_status?: string;
  status?: string;
  client_reference_id?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | null;
  metadata?: Record<string, string>;
  url?: string | null;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/** How old a signed webhook may be. Stripe's own libraries use the same five minutes. */
const TOLERANCE_SECONDS = 300;

export class StripeGateway {
  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Both halves are needed: one to sell, the other to know it sold. */
  get configured(): boolean {
    return Boolean(this.secretKey && this.webhookSecret);
  }

  async createCheckout(request: CheckoutRequest): Promise<StripeSession> {
    const body = new URLSearchParams({
      mode: 'payment',
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      client_reference_id: request.orderId,
      'metadata[order_id]': request.orderId,
      'payment_intent_data[metadata][order_id]': request.orderId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(request.usdCents),
      'line_items[0][price_data][product_data][name]': request.name,
      'line_items[0][price_data][product_data][description]': request.description,
    });
    const response = await this.fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        // A retried create for the same order returns the same session.
        'idempotency-key': `checkout-${request.orderId}`,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const session = (await response.json()) as StripeSession & { error?: { message?: string } };
    if (!response.ok || typeof session.id !== 'string' || !session.id || !session.url) throw new Error(session.error?.message ?? `Stripe answered ${response.status}`);
    return session;
  }

  /**
   * The event, if and only if Stripe signed it recently with our secret.
   *
   * `t=…,v1=…` over `${t}.${raw body}`, HMAC-SHA256. Every v1 in the header is
   * tried, because Stripe sends one per active secret while a secret is being
   * rolled.
   */
  verify(rawBody: string, header: string | undefined, now: number): StripeEvent | null {
    if (!this.webhookSecret || !header) return null;
    const parts = header.split(',').map((part) => part.trim().split('='));
    const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
    const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value ?? '');
    if (!Number.isFinite(timestamp) || signatures.length === 0) return null;
    if (Math.abs(now / 1000 - timestamp) > TOLERANCE_SECONDS) return null;
    const expected = createHmac('sha256', this.webhookSecret).update(`${timestamp}.${rawBody}`).digest();
    const valid = signatures.some((signature) => {
      if (!/^[a-f0-9]{64}$/.test(signature)) return false;
      const given = Buffer.from(signature, 'hex');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
    if (!valid) return null;
    try {
      const event = JSON.parse(rawBody) as StripeEvent;
      return typeof event?.id === 'string' && typeof event.type === 'string' && event.data &&
        event.data.object !== null && typeof event.data.object === 'object' && !Array.isArray(event.data.object) ? event : null;
    } catch {
      return null;
    }
  }
}

/** What the test suite signs events with, and what a local `stripe listen` run would send. */
export function signStripePayload(secret: string, body: string, timestamp: number): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}
