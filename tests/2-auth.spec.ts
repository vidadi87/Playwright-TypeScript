import { Request } from "@playwright/test";
import { test, expect } from "../fixtures";
import { AUTH_URL_RE } from "../pages/AuthPage";
import { AUTH_MESSAGES, INVALID_EMAILS } from "../test-data/auth";

/**
 * [2] Авторизация по почте.
 * 2.1–2.3 (успешный вход, неверный и просроченный код) требуют тестового почтового ящика — пока не автоматизированы.
 * 2.4 не зависит от ящика: проверка формата почты на стороне формы, запрос на сервер не уходит.
 */

/** Запросы на отправку кода: всё в api.unicoplay.com/auth, кроме служебных refresh и device/login */
function isSendCodeRequest(r: Request): boolean {
  const url = r.url();
  return url.includes("api.unicoplay.com/auth") && !/\/auth\/(refresh|device)/.test(url) && r.method() !== "GET";
}

test.describe("[2] Авторизация по почте", () => {
  test.describe("[2.4] Некорректный email", () => {
    test.beforeEach(async ({ ruHome, auth }) => {
      await ruHome.header.openLogin();
      await auth.expectOpened();
      await auth.switchToEmail();
    });

    test("[2.4.1] Некорректный формат email на форме входа", async ({ page, auth }) => {
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

    test("[2.4.2] Пустой email на форме входа", async ({ page, auth }) => {
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
