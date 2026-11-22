import { Locator, Page, expect, test } from "@playwright/test";
import { AUTH_MESSAGES } from "../test-data/auth";

/** Страница входа: /ru/auth, /auth, /en/auth — без привязки к языку интерфейса */
export const AUTH_URL_RE = /\/auth(\/|\?|#|$)/;

/** Капчу не автоматизируем: это защита сайта от частых запросов кода, её вводит человек */
export const CAPTCHA_MESSAGE =
  "Сайт показал капчу «Введите число с картинки»: слишком частые запросы кода. " +
  "Пройдите вход вручную с вводом капчи и повторите прогон позже";

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
  /** Экран ввода кода: одно скрытое поле на 6 цифр, поверх него нарисованы 6 клеток (перехватывают клики) */
  readonly codeInput: Locator;
  readonly codeCellsWithError: Locator;
  readonly wrongCodeToast: Locator;
  readonly captchaInput: Locator;

  constructor(private readonly page: Page) {
    this.phoneTitle = page.getByText("Введите номер телефона", { exact: true });
    this.emailTitle = page.getByText("Введите почту", { exact: true });
    // Кнопка-иконка конверта под «Войти», без подписи
    this.emailModeButton = page.locator('[class*="AuthEmailButton_button"]');
    this.input = page.locator('[class*="AuthSteps"] input, form input').first();
    this.submitButton = page.locator('[class*="AuthSteps_newButton"]');
    this.codeInput = page.getByRole("textbox", { name: "Code input" });
    this.codeCellsWithError = page.locator('[class*="CodeField_codeCell"][class*="CodeField_error"]');
    // Ошибка неверного кода — всплывающее уведомление справа внизу, не текст в форме
    this.wrongCodeToast = page.getByText(AUTH_MESSAGES.wrongCode, { exact: true });
    // Появляется на экране ввода кода при частых запросах кода
    this.captchaInput = page.getByRole("textbox", { name: "Введите число с картинки" });
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

  /** Отправка почты и ожидание экрана ввода кода */
  async requestCode(email: string) {
    await test.step("Запрос кода на почту", async () => {
      await this.submitEmail(email);
      await expect(this.codeInput, "Не открылся экран ввода кода").toBeAttached({ timeout: 15_000 });
    });
  }

  /**
   * Ввод кода. fill() без клика: клетки поверх поля перехватывают клики.
   * После 6-й цифры сайт отправляет код сам, «Продолжить» нажимать не нужно.
   */
  async enterCode(code: string) {
    await this.codeInput.fill(code);
  }

  /** Капча уже на экране — сразу понятная ошибка вместо невнятного таймаута дальше */
  async failIfCaptcha() {
    if (await this.captchaInput.isVisible()) throw new Error(CAPTCHA_MESSAGE);
  }

  /**
   * Ждёт ожидаемый результат ввода кода (уведомление, признак входа). Если вместо него сайт
   * показал капчу — падает с понятным сообщением.
   */
  async waitForCodeResult(expected: Locator, message: string) {
    let captcha = false;
    await expect
      .poll(
        async () => {
          captcha = await this.captchaInput.isVisible();
          return captcha || (await expected.isVisible());
        },
        { message, timeout: 15_000 },
      )
      .toBe(true);
    if (captcha) throw new Error(CAPTCHA_MESSAGE);
  }

  errorMessage(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }
}
