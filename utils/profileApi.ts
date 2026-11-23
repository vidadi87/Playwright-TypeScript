import { Page, expect } from "@playwright/test";

const API_RE = /^https:\/\/api\.unicoplay\.com\//;

/** Профиль из GET /profile/list: только поля, которые нужны тестам (e-mail и id аккаунта не берём) */
export type ServerProfile = {
  name: string;
  child: boolean;
  /** Язык интерфейса профиля: "ru", "en", "kk" */
  interface: string;
  avatar: string;
};

/**
 * Чтение настроек профилей с сервера. Нужно там, где интерфейс не показывает сохранённое состояние
 * надёжно: после переключения профиля адрес остаётся на языке прежней страницы.
 * Ключ API (apikey) — публичный ключ веб-клиента, берём его из запросов самой страницы.
 */
export class ProfileApi {
  private apiKey?: string;

  constructor(private readonly page: Page) {
    page.on("request", (r) => {
      if (this.apiKey || !API_RE.test(r.url())) return;
      this.apiKey = new URL(r.url()).searchParams.get("apikey") ?? undefined;
    });
  }

  private async get(path: string): Promise<any> {
    // Ключ появляется после первого запроса страницы к API: если страница ещё пустая — открываем главную
    if (!this.apiKey && this.page.url() === "about:blank") {
      await this.page.goto("/", { waitUntil: "domcontentloaded" });
    }
    await expect.poll(() => this.apiKey, { message: "Страница ещё не обращалась к API сайта" }).toBeTruthy();
    const response = await this.page.request.get(`https://api.unicoplay.com${path}?apikey=${this.apiKey}`);
    expect(response.status(), `GET ${path}`).toBe(200);
    return response.json();
  }

  /** Все профили аккаунта */
  async list(): Promise<ServerProfile[]> {
    return (await this.get("/profile/list")).map(toProfile);
  }

  /** Профиль, выбранный в текущей сессии браузера (выбор профиля — POST /profile/select) */
  async current(): Promise<ServerProfile> {
    return toProfile(await this.get("/profile"));
  }

  /**
   * Открыть главную активного профиля на его языке: /ru, /en/kids, /kids (казахский — без префикса).
   * Сам сайт после переключения профиля может остаться на языке прежней страницы.
   */
  async openHomeInProfileLanguage() {
    const profile = await this.current();
    const lang = profile.interface === "kk" ? "" : `/${profile.interface}`;
    const path = `${lang}${profile.child ? "/kids" : ""}` || "/";
    // Переход может прерваться (ERR_ABORTED), если сайт в этот момент сам перенаправляет страницу
    await expect(async () => {
      await this.page.goto(path, { waitUntil: "domcontentloaded" });
    }, `Главная профиля «${profile.name}» не открылась`).toPass({ timeout: 30_000 });
    return profile;
  }

  /** Язык интерфейса профиля по имени */
  async interfaceLanguage(name: string): Promise<string> {
    const profile = (await this.list()).find((p) => p.name === name);
    if (!profile) throw new Error(`Профиль «${name}» не найден на сервере`);
    return profile.interface;
  }

  /** Дождаться, пока язык профиля на сервере станет нужным (сохранение идёт асинхронно) */
  async expectInterfaceLanguage(name: string, lang: string, message: string) {
    await expect.poll(() => this.interfaceLanguage(name), { message, timeout: 15_000 }).toBe(lang);
  }
}

function toProfile(p: Record<string, any>): ServerProfile {
  return { name: p.fullname, child: p.child, interface: p.language?.interface ?? "", avatar: p.avatar ?? "" };
}
