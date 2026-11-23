import { Page, expect } from "@playwright/test";
import type { Section } from "../test-data/sections";

/** Страница раздела из меню шапки («Фильмы», «Мультсериалы» …) */
export class SectionPage {
  constructor(private readonly page: Page) {}

  /** Раздел открылся: адрес, заголовок и карточки контента (или текст «пусто», если раздел бывает пустым) */
  async expectOpened(section: Section) {
    await expect(this.page).toHaveURL(section.url);
    if (section.heading) {
      await expect(this.page.locator("h1").first(), "Заголовок раздела").toHaveText(section.heading);
    }
    const cards = this.page.locator(section.cards);
    const emptyText = section.emptyText ? this.page.getByText(section.emptyText) : null;
    await expect
      .poll(async () => (await cards.count()) > 0 || (emptyText !== null && (await emptyText.isVisible())), {
        message: `В разделе «${section.menu}» нет карточек контента`,
        timeout: 15_000,
      })
      .toBe(true);
  }
}
