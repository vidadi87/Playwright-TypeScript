import { existsSync } from "node:fs";
import { test as setup } from "@playwright/test";
import { Header } from "../components/Header";
import { AuthPage } from "../pages/AuthPage";
import { HomePage } from "../pages/HomePage";
import { AUTH_STATE_FILE } from "../test-data/auth";
import { Mailbox, hasTestAccount, testAccount } from "../utils/mailbox";

/**
 * Подготовка для разделов 3–4: вход в тестовый аккаунт один раз и сохранение сессии в
 * playwright/.auth/ (в .gitignore). Если сохранённая сессия ещё действует — вход не выполняется,
 * письмо с кодом не отправляется: так меньше писем и меньше шансов получить капчу.
 */
setup("Вход в тестовый аккаунт (сессия для разделов 3–4)", async ({ browser }) => {
  setup.skip(!hasTestAccount(), "Нет TEST_EMAIL и GMAIL_APP_PASSWORD в .env (см. .env.example)");
  setup.setTimeout(120_000);

  if (existsSync(AUTH_STATE_FILE)) {
    const context = await browser.newContext({ storageState: AUTH_STATE_FILE });
    const page = await context.newPage();
    await page.goto("/ru", { waitUntil: "domcontentloaded" });
    const stillLoggedIn = await new Header(page).favoritesLink
      .first()
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    await context.close();
    if (stillLoggedIn) return;
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  const home = new HomePage(page);
  const auth = new AuthPage(page);
  const mailbox = await Mailbox.connect();
  try {
    await home.openInRussian();
    await home.header.openLogin();
    await auth.expectOpened();
    await auth.switchToEmail();

    const since = await mailbox.checkpoint();
    await auth.requestCode(testAccount().user);
    await auth.failIfCaptcha();
    await auth.enterCode(await mailbox.waitForOtp(since));

    await auth.waitForCodeResult(home.header.favoritesLink.first(), "После ввода кода вход не выполнен");
    await home.header.expectLoggedIn();
    await context.storageState({ path: AUTH_STATE_FILE });
  } finally {
    await mailbox.close();
    await context.close();
  }
});
