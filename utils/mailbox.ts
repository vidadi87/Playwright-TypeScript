import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { OTP_EMAIL } from "../test-data/auth";

/**
 * Тестовый Gmail-ящик: чтение писем с OTP-кодом по IMAP.
 * Доступ — пароль приложения Google из .env (TEST_EMAIL, GMAIL_APP_PASSWORD), см. .env.example.
 *
 * Как не взять старый код: перед запросом кода запоминаем uidNext папки «Входящие» (UID, который
 * получит следующее письмо) — checkpoint(). Потом ждём письмо от Unico Play с UID не меньше
 * запомненного — waitForOtp(). Так не нужно сравнивать время и не мешают 100+ старых писем с кодами.
 */
export class Mailbox {
  private constructor(private readonly client: ImapFlow) {}

  /**
   * Подключение к Gmail по IMAP. Изредка подключение зависает без ошибки — поэтому таймауты
   * и несколько попыток, иначе весь лимит времени теста уходит на ожидание.
   */
  static async connect({ attempts = 3, timeoutMs = 15_000 } = {}): Promise<Mailbox> {
    const { user, pass } = testAccount();
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const client = new ImapFlow({
        host: "imap.gmail.com",
        port: 993,
        secure: true,
        auth: { user, pass },
        logger: false,
        connectionTimeout: timeoutMs,
        greetingTimeout: timeoutMs,
        socketTimeout: 60_000,
      });
      try {
        await withTimeout(client.connect(), timeoutMs);
        return new Mailbox(client);
      } catch (error) {
        lastError = error;
        client.close();
      }
    }
    throw new Error(
      `Не удалось подключиться к Gmail по IMAP за ${attempts} попытки: ${(lastError as Error)?.message ?? lastError}`,
    );
  }

  /** Метка «до запроса кода»: письма, пришедшие после неё, получат UID не меньше возвращённого */
  async checkpoint(): Promise<number> {
    const lock = await this.client.getMailboxLock("INBOX");
    try {
      if (!this.client.mailbox) throw new Error("Папка «Входящие» не открылась");
      return this.client.mailbox.uidNext;
    } finally {
      lock.release();
    }
  }

  /** Ждёт письмо с кодом от Unico Play, пришедшее после checkpoint, и возвращает 6-значный код */
  async waitForOtp(sinceUid: number, timeoutMs = 60_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const code = await this.findOtp(sinceUid);
      if (code) return code;
      await new Promise((resolve) => setTimeout(resolve, 2_500));
    }
    throw new Error(`Письмо с кодом от ${OTP_EMAIL.from} не пришло за ${timeoutMs / 1000} сек`);
  }

  async close() {
    await this.client.logout().catch(() => this.client.close());
  }

  private async findOtp(sinceUid: number): Promise<string | null> {
    const lock = await this.client.getMailboxLock("INBOX");
    try {
      await this.client.noop(); // обновить состояние папки: новые письма приходят асинхронно
      const found = await this.client.search({ from: OTP_EMAIL.from }, { uid: true });
      // search «uid N:*» вернул бы последнее письмо, даже если оно старше N, поэтому фильтруем сами
      const fresh = (found || []).filter((uid) => uid >= sinceUid);
      if (!fresh.length) return null;

      const message = await this.client.fetchOne(String(fresh[fresh.length - 1]), { source: true }, { uid: true });
      if (!message || !message.source) return null;
      const text = (await simpleParser(message.source)).text ?? "";
      return text.match(OTP_EMAIL.codePattern)?.[1] ?? null;
    } finally {
      lock.release();
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`нет ответа за ${ms / 1000} сек`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Учётные данные тестового ящика из окружения. Пробелы в пароле приложения (как его показывает Google) убираем */
export function testAccount(): { user: string; pass: string } {
  const user = process.env.TEST_EMAIL ?? "";
  const pass = (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "");
  if (!user || !pass) {
    throw new Error("Не заданы TEST_EMAIL и GMAIL_APP_PASSWORD: заполните .env по образцу .env.example");
  }
  return { user, pass };
}

export function hasTestAccount(): boolean {
  return Boolean(process.env.TEST_EMAIL && process.env.GMAIL_APP_PASSWORD);
}
