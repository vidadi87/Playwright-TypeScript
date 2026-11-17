import { Locator, Page, expect, test } from "@playwright/test";

/** Шапка сайта: меню разделов, поиск, меню аккаунта */
export class Header {
  readonly searchInput: Locator;
  readonly accountMenu: Locator;

  constructor(private readonly page: Page) {
    this.searchInput = page.locator("#header_search");
    this.accountMenu = page.getByRole("img", { name: "Account menu" });
  }

  /** Пункт меню разделов («Фильмы», «Сериалы», …). exact: «Детям» не путать с «Для детей» в подменю */
  menuLink(name: string): Locator {
    return this.page.getByRole("link", { name, exact: true });
  }

  /** Поиск: ввод запроса и Enter. Подсказок при вводе на сайте нет, результаты — на /ru/search?q= */
  async search(query: string) {
    await test.step(`Поиск «${query}»`, async () => {
      await this.searchInput.click();
      await this.searchInput.fill(query);
      await this.searchInput.press("Enter");
      await this.page.waitForURL(/\/ru\/search\?q=/);
    });
  }

  /**
   * Открытие страницы входа через интерфейс: аватар → «Войти».
   * Прямое открытие /ru/auth по ссылке не используем: известный дефект, кнопки на странице не работают.
   */
  async openLogin() {
    await test.step("Открытие страницы входа через меню аккаунта", async () => {
      await this.accountMenu.click();
      await this.page.getByRole("button", { name: "Войти", exact: true }).click();
      await this.page.waitForURL(/\/ru\/auth/);
    });
  }

  async expectRussianMenu() {
    for (const name of ["Фильмы", "Сериалы"]) {
      await expect(this.menuLink(name), `В меню нет пункта «${name}» на русском`).toBeVisible();
    }
  }
}
