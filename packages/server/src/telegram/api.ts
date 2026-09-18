import { log } from '../log.js';

/**
 * The only thing in this repository that talks to api.telegram.org.
 *
 * Every raw call funnels through `call()`, which is what makes three things
 * true at once: the bot token appears in exactly one string concatenation, a
 * slow Telegram can never hold an HTTP request or a game tick open, and a
 * failure is a typed value rather than an exception nobody caught. Spreading
 * `fetch('https://api.telegram.org/bot' + token + ...)` through the codebase
 * would give up all three.
 */

/** Telegram is a dependency, not a partner. Nothing waits on it for long. */
const TIMEOUT_MS = 8_000;

export interface TelegramApiError {
  ok: false;
  /** Telegram's own error code, or 0 when the call never got an answer. */
  status: number;
  description: string;
  /** Seconds Telegram asked us to wait, when it said so. */
  retryAfter: number | null;
  /** True when retrying could plausibly work. A 403 is not retryable. */
  retryable: boolean;
}

export type TelegramApiResult<T> = { ok: true; result: T } | TelegramApiError;

export interface InlineKeyboardButton {
  text: string;
  /** Sent back as `callback_query.data`. Keep it short; Telegram caps it at 64 bytes. */
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
  pay?: boolean;
}

export interface SendMessageOptions {
  chatId: number | string;
  text: string;
  /** HTML only. The product never builds Markdown, so nothing has to escape twice. */
  buttons?: InlineKeyboardButton[][];
  disablePreview?: boolean;
  replyToMessageId?: number;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
}

export interface BotCommand {
  command: string;
  description: string;
}

export class TelegramBotApi {
  constructor(private readonly token: string) {}

  get configured(): boolean {
    return Boolean(this.token);
  }

  /**
   * One request to the Bot API.
   *
   * `method` is a literal at every call site in this package, never anything
   * derived from user input, so there is no path from a chat message to an
   * arbitrary API method.
   */
  private async call<T>(method: string, body: Record<string, unknown>): Promise<TelegramApiResult<T>> {
    if (!this.token)
      return { ok: false, status: 0, description: 'no bot token', retryAfter: null, retryable: false };
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        result?: T;
        description?: string;
        error_code?: number;
        parameters?: { retry_after?: number };
      };
      if (response.ok && payload.ok) return { ok: true, result: payload.result as T };
      const status = Number(payload.error_code ?? response.status);
      const retryAfter = Number(payload.parameters?.retry_after ?? 0) || null;
      // 403 is "the user blocked the bot" or "the chat is gone": retrying that
      // forever is how an outbox turns into a queue of impossible work.
      const retryable = status === 429 || status >= 500 || status === 0;
      log.warn('telegram api rejected a call', {
        method,
        status,
        // Telegram's descriptions are short and contain no user content worth
        // redacting, but they are truncated anyway: a log line is not a dump.
        description: String(payload.description ?? '').slice(0, 160),
      });
      return {
        ok: false,
        status,
        description: String(payload.description ?? 'telegram error').slice(0, 300),
        retryAfter,
        retryable,
      };
    } catch (error) {
      log.warn('telegram api unreachable', {
        method,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      return {
        ok: false,
        status: 0,
        description: 'telegram unreachable',
        retryAfter: null,
        retryable: true,
      };
    }
  }

  sendMessage(options: SendMessageOptions): Promise<TelegramApiResult<TelegramMessage>> {
    return this.call<TelegramMessage>('sendMessage', {
      chat_id: options.chatId,
      text: options.text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: options.disablePreview ?? true },
      ...(options.buttons ? { reply_markup: { inline_keyboard: options.buttons } } : {}),
      ...(options.replyToMessageId
        ? { reply_parameters: { message_id: options.replyToMessageId, allow_sending_without_reply: true } }
        : {}),
    });
  }

  /**
   * Replaces a message in place.
   *
   * Used where a chat would otherwise fill with near-identical lines —
   * "Searching…" becoming "Opponent found" is one message that changed, not two
   * that happened.
   */
  editMessageText(input: {
    chatId: number | string;
    messageId: number;
    text: string;
    buttons?: InlineKeyboardButton[][];
  }): Promise<TelegramApiResult<TelegramMessage | boolean>> {
    return this.call('editMessageText', {
      chat_id: input.chatId,
      message_id: input.messageId,
      text: input.text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(input.buttons ? { reply_markup: { inline_keyboard: input.buttons } } : {}),
    });
  }

  /**
   * Clears the spinner on a tapped inline button.
   *
   * Telegram shows one until this is answered, so every callback path answers
   * it — including the ones that go on to do nothing.
   */
  answerCallbackQuery(input: {
    id: string;
    text?: string;
    alert?: boolean;
  }): Promise<TelegramApiResult<boolean>> {
    return this.call('answerCallbackQuery', {
      callback_query_id: input.id,
      ...(input.text ? { text: input.text.slice(0, 200) } : {}),
      ...(input.alert ? { show_alert: true } : {}),
    });
  }

  setMyCommands(
    commands: BotCommand[],
    languageCode?: string,
  ): Promise<TelegramApiResult<boolean>> {
    return this.call('setMyCommands', {
      commands,
      ...(languageCode ? { language_code: languageCode } : {}),
    });
  }

  setMyDescription(description: string, languageCode?: string): Promise<TelegramApiResult<boolean>> {
    return this.call('setMyDescription', {
      description,
      ...(languageCode ? { language_code: languageCode } : {}),
    });
  }

  setMyShortDescription(
    shortDescription: string,
    languageCode?: string,
  ): Promise<TelegramApiResult<boolean>> {
    return this.call('setMyShortDescription', {
      short_description: shortDescription,
      ...(languageCode ? { language_code: languageCode } : {}),
    });
  }

  /** The button beside the chat input. One tap into the game. */
  setChatMenuButton(input: { text: string; url: string }): Promise<TelegramApiResult<boolean>> {
    return this.call('setChatMenuButton', {
      menu_button: { type: 'web_app', text: input.text, web_app: { url: input.url } },
    });
  }

  setWebhook(input: {
    url: string;
    secretToken: string;
    allowedUpdates: string[];
  }): Promise<TelegramApiResult<boolean>> {
    return this.call('setWebhook', {
      url: input.url,
      secret_token: input.secretToken,
      allowed_updates: input.allowedUpdates,
      // A restart should not replay an hour of updates at a cold process.
      drop_pending_updates: false,
      max_connections: 20,
    });
  }

  deleteWebhook(): Promise<TelegramApiResult<boolean>> {
    return this.call('deleteWebhook', {});
  }

  getMe(): Promise<TelegramApiResult<{ id: number; username: string; first_name: string }>> {
    return this.call('getMe', {});
  }

  /**
   * A payment link for digital goods, priced in Telegram Stars.
   *
   * `provider_token` is deliberately empty and `currency` is XTR: that pair is
   * what tells Telegram this is a Stars purchase rather than a card payment,
   * and it is the only payment flow this product has.
   */
  createInvoiceLink(input: {
    title: string;
    description: string;
    payload: string;
    stars: number;
    label: string;
  }): Promise<TelegramApiResult<string>> {
    return this.call<string>('createInvoiceLink', {
      title: input.title,
      description: input.description,
      payload: input.payload,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: input.label, amount: input.stars }],
    });
  }

  /**
   * Telegram gives ten seconds to answer this or it cancels the charge, which
   * is why the webhook answers it before doing anything else.
   */
  answerPreCheckoutQuery(input: {
    id: string;
    ok: boolean;
    errorMessage?: string;
  }): Promise<TelegramApiResult<boolean>> {
    return this.call('answerPreCheckoutQuery', {
      pre_checkout_query_id: input.id,
      ok: input.ok,
      ...(input.ok ? {} : { error_message: input.errorMessage ?? 'This purchase is unavailable.' }),
    });
  }

  refundStarPayment(input: {
    userId: number;
    chargeId: string;
  }): Promise<TelegramApiResult<boolean>> {
    return this.call('refundStarPayment', {
      user_id: input.userId,
      telegram_payment_charge_id: input.chargeId,
    });
  }
}
