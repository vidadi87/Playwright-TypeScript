import { Locator, Page, expect, test } from "@playwright/test";
import { AccountMenu } from "./AccountMenu";

/** Коды языков в выпадающем списке окна «Язык интерфейса» (одинаковы на любом языке интерфейса) */
export type LanguageCode = "ҚAЗ" | "РУС" | "ENG";

/** Префикс адреса после сохранения языка (казахский — без префикса) */
const URL_PREFIX: Record<LanguageCode, RegExp> = {
  ҚAЗ: /^https?:\/\/[^/]+\/(?!ru(\/|\?|#|$)|en(\/|\?|#|$))/,
  РУС: /^https?:\/\/[^/]+\/ru(\/|\?|#|$)/,
  ENG: /^https?:\/\/[^/]+\/en(\/|\?|#|$)/,
};

/** Окно «Язык интерфейса»: выпадающий список языков и «Сохранить». Язык сохраняется в профиле на сервере */
export class LanguagePopup {
  readonly root: Locator;
  readonly selected: Locator;
  readonly saveButton: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('[class*="StartPopups_start-popup__wrapper"]').first();
    this.selected = this.root.locator('[class*="Input_start-select-selected"]').first();
    this.saveButton = this.root.locator('[class*="StartPopups_start-popup__button"]');
  }

  /** Меню аккаунта → «Язык интерфейса» → выбор языка → «Сохранить» */
  async setLanguage(code: LanguageCode) {
    await test.step(`Смена языка профиля на ${code}`, async () => {
      const menu = new AccountMenu(this.page);
      await menu.open();
      await menu.languageItem.click();
      await expect(this.root, "Окно «Язык интерфейса» не открылось").toBeVisible();
      await this.selected.click();
      await this.root.locator('[class*="Input_start-select-options__item"]').filter({ hasText: new RegExp(`^${code}$`) }).click();
      await this.saveButton.click();
      await expect(this.root, "Окно «Язык интерфейса» не закрылось").toBeHidden({ timeout: 10_000 });
      // После сохранения сайт сам переходит на адрес нового языка — дожидаемся, чтобы не перебить переход
      await expect(this.page, `Адрес не сменился на язык ${code}`).toHaveURL(URL_PREFIX[code], { timeout: 15_000 });
      await this.page.waitForLoadState("domcontentloaded");
    });
  }
}
