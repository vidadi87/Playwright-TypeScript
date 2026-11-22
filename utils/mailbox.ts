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

  static async connect(): Promise<Mailbox> {
    const { user, pass } = testAccount();
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    });
    await client.connect();
    return new Mailbox(client);
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
