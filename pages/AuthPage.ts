import { Locator, Page, expect, test } from "@playwright/test";

export const AUTH_URL_RE = /\/ru\/auth/;

/**
 * Страница входа. Вход на сайте только по OTP-коду (телефон — SMS, почта — письмо), паролей нет.
 * Открывается только через меню аккаунта (Header.openLogin), не по прямой ссылке.
 */
export class AuthPage {
  readonly phoneTitle: Locator;
  readonly emailTitle: Locator;
  readonly emailModeButton: Locator;
  readonly input: Locator;
  readonly submitButton: Locator;

  constructor(private readonly page: Page) {
    this.phoneTitle = page.getByText("Введите номер телефона", { exact: true });
    this.emailTitle = page.getByText("Введите почту", { exact: true });
    // Кнопка-иконка конверта под «Войти», без подписи
    this.emailModeButton = page.locator('[class*="AuthEmailButton_button"]');
    this.input = page.locator('[class*="AuthSteps"] input, form input').first();
    this.submitButton = page.locator('[class*="AuthSteps_newButton"]');
  }

  async expectOpened() {
    await expect(this.page, "Не открылась страница входа").toHaveURL(AUTH_URL_RE);
    await expect(this.phoneTitle, "На странице входа нет формы входа по телефону").toBeVisible();
  }

  /**
   * Переключение формы на вход по почте. Если нажать на конверт до полной загрузки страницы,
   * форма не переключается (дефект сайта), поэтому повторяем клик, пока форма не сменится.
   */
  async switchToEmail() {
    await test.step("Переключение формы входа на почту", async () => {
      await expect(async () => {
        await this.emailModeButton.click();
        await expect(this.emailTitle).toBeVisible({ timeout: 2_000 });
      }, "Форма входа не переключилась на почту").toPass({ timeout: 20_000 });
    });
  }

  async submitEmail(value: string) {
    await this.input.fill(value);
    await this.submitButton.click();
  }

  errorMessage(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }
}
