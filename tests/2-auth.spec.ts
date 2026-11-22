import { Page, Request } from "@playwright/test";
import { test, expect } from "../fixtures";
import { Header } from "../components/Header";
import { AUTH_URL_RE, AuthPage } from "../pages/AuthPage";
import { HomePage } from "../pages/HomePage";
import { AUTH_MESSAGES, INVALID_EMAILS, wrongCodeFor } from "../test-data/auth";
import { Mailbox, hasTestAccount, testAccount } from "../utils/mailbox";

/**
 * [2] Авторизация по почте.
 * 2.1–2.2: OTP-код читается из письма в тестовом Gmail по IMAP (utils/mailbox.ts, доступ из .env).
 * 2.3 не зависит от ящика: проверка формата почты на стороне формы, запрос на сервер не уходит.
 *
 * Проверки после входа не завязаны на язык интерфейса: язык после входа берётся из настроек аккаунта.
 */

/** Запросы на отправку кода: всё в api.unicoplay.com/auth, кроме служебных refresh и device/login */
function isSendCodeRequest(r: Request): boolean {
  const url = r.url();
  return url.includes("api.unicoplay.com/auth") && !/\/auth\/(refresh|device)/.test(url) && r.method() !== "GET";
}

test.describe("[2] Авторизация по почте", () => {
  /**
   * 2.2 и 2.1 — один запрос кода на оба кейса: при частых запросах кода сайт показывает капчу.
   * Поэтому группа идёт последовательно на одной странице: в beforeAll запрашиваем код и читаем его
   * из письма, затем 2.2 вводит неверный код, затем 2.1 — верный на том же экране.
   * Минус: тесты зависят друг от друга — если 2.2 упадёт, 2.1 не запустится (mode: "serial").
   */
  test.describe("[2.1–2.2] Вход по коду из письма", () => {
    test.describe.configure({ mode: "serial", timeout: 120_000 });
    test.skip(!hasTestAccount(), "Нет TEST_EMAIL и GMAIL_APP_PASSWORD в .env (см. .env.example)");

    let page: Page;
    let auth: AuthPage;
    let header: Header;
    let mailbox: Mailbox | undefined;
    let code: string;

    test.beforeAll(async ({ browser }) => {
      // Страница создаётся вручную, чтобы жить между тестами группы; настройки (baseURL, локаль)
      // Playwright подставляет из конфига
      page = await browser.newPage();
      const home = new HomePage(page);
      auth = new AuthPage(page);
      header = home.header;

      await home.openInRussian();
      await header.openLogin();
      await auth.expectOpened();
      await auth.switchToEmail();

      mailbox = await Mailbox.connect();
      const since = await mailbox.checkpoint();
      await auth.requestCode(testAccount().user);
      await auth.failIfCaptcha();
      code = await mailbox.waitForOtp(since);
    });

    test.afterAll(async () => {
      await mailbox?.close();
      await page?.close();
    });

    test("[2.2.1] Авторизация по почте с неверным кодом", async () => {
      // Неверный код строим из настоящего, чтобы он гарантированно не совпал с ним
      await auth.enterCode(wrongCodeFor(code));

      await auth.waitForCodeResult(auth.wrongCodeToast, "Нет уведомления «Неверный код»");
      await expect(auth.codeCellsWithError, "Клетки кода не подсвечены ошибкой").toHaveCount(6);
      await expect(page, "Пользователь ушёл со страницы входа").toHaveURL(AUTH_URL_RE);
      await header.expectLoggedOut();
    });

    test("[2.1.1] Успешная авторизация по почте с кодом", async () => {
      await auth.enterCode(code);

      await test.step("Открылась главная, пользователь авторизован", async () => {
        await auth.waitForCodeResult(header.favoritesLink.first(), "После ввода кода вход не выполнен");
        // Главная любого языка: «/», «/ru», «/en» — язык после входа берётся из аккаунта
        await expect.poll(() => new URL(page.url()).pathname, { message: "После входа не открылась главная" }).toMatch(
          /^\/([a-z]{2}\/?)?$/,
        );
        await header.expectLoggedIn();
      });

      await test.step("После перезагрузки сессия сохраняется", async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        await header.expectLoggedIn();
      });
    });
  });

  test.describe("[2.3] Некорректный email", () => {
    test.beforeEach(async ({ ruHome, auth }) => {
      await ruHome.header.openLogin();
      await auth.expectOpened();
      await auth.switchToEmail();
    });

    test("[2.3.1] Некорректный формат email на форме входа", async ({ page, auth }) => {
      const sent: string[] = [];
      page.on("request", (r) => isSendCodeRequest(r) && sent.push(r.url()));

      for (const { value, reason } of INVALID_EMAILS) {
        await test.step(`«${value}» (${reason})`, async () => {
          await auth.submitEmail(value);
          await expect(auth.errorMessage(AUTH_MESSAGES.invalidEmail)).toBeVisible();
          await expect(page, "Открылся экран ввода кода").toHaveURL(AUTH_URL_RE);
          await expect(auth.emailTitle).toBeVisible();
        });
      }

      expect(sent, "При некорректном email ушёл запрос на отправку кода").toEqual([]);
    });

    test("[2.3.2] Пустой email на форме входа", async ({ page, auth }) => {
      const sent: string[] = [];
      page.on("request", (r) => isSendCodeRequest(r) && sent.push(r.url()));

      await auth.submitEmail("");
      await expect(auth.errorMessage(AUTH_MESSAGES.emptyEmail)).toBeVisible();
      await expect(page, "Открылся экран ввода кода").toHaveURL(AUTH_URL_RE);
      await expect(auth.emailTitle).toBeVisible();

      expect(sent, "При пустом email ушёл запрос на отправку кода").toEqual([]);
    });
  });
});
