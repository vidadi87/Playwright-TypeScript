import { Locator, Page } from "@playwright/test";

export const SEARCH_URL_RE = /\/ru\/search\?q=/;

/** Страница результатов поиска: блоки «Фильмы и сериалы», «Персоны», «В записи на телеканалах» */
export class SearchResultsPage {
  constructor(private readonly page: Page) {}

  blockHeading(name: "Фильмы и сериалы" | "Персоны"): Locator {
    return this.page.getByRole("heading", { name, exact: true });
  }

  /** Результат-продукт по адресу карточки (у карточки несколько ссылок: постер, название, жанры) */
  productResult(url: string): Locator {
    return this.page.locator(`a[href="${url}"]`).filter({ hasText: /\S/ }).first();
  }

  /** Результат-персона по адресу страницы персоны */
  personResult(url: string): Locator {
    return this.page.locator(`a[href="${url}"]`).filter({ hasText: /\S/ }).first();
  }
}
