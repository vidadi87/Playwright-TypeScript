import { Locator, Page, expect } from "@playwright/test";

/** URL карточки продукта */
export const PRODUCT_URL_RE = /\/watch\//;

/** Заголовок карточки начинается с типа: «Фильм Достать ножи – смотреть онлайн», «Сериал Черная икра – …» */
export const MOVIE_TITLE_RE = /^Фильм /;
export const SERIES_TITLE_RE = /^Сериал /;

/** Карточка продукта (фильм или сериал) */
export class ProductPage {
  readonly title: Locator;
  /** Основная кнопка воспроизведения: «Смотреть бесплатно», «Смотреть 1 сезон 3 серию» и т.п. */
  readonly playButton: Locator;
  readonly trailerButton: Locator;
  readonly episodes: Locator;
  readonly actorLinks: Locator;

  constructor(private readonly page: Page) {
    this.title = page.locator("h1").first();
    this.playButton = page.locator('[class*="TopBlock_TopBlock__button-play"]').first();
    this.trailerButton = page.getByText("Трейлер").first();
    this.episodes = page.locator("#series").locator('[class*="SeriesSlider_item-wrap"]');
    // Первая ссылка блока — «Актеры и съемочная группа» (/watch/…/person), персоны — /ru/person/…
    this.actorLinks = page.locator('#persons a[href^="/ru/person/"]');
  }

  async open(url: string) {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(this.title).toBeVisible();
  }

  /** Карточка серии в блоке «Сезоны и серии» по номеру («3 серия») */
  episode(number: number): Locator {
    // По вложенному элементу с точным текстом: hasText сравнивает склеенный текст карточки («53 мин3 серияВ море…»)
    return this.episodes.filter({ has: this.page.getByText(`${number} серия`, { exact: true }) }).first();
  }

  /** Картинка карточки серии: клик по ней запускает серию (по тексту «N серия» — открывает страницу серии) */
  episodeImage(number: number): Locator {
    return this.episode(number).locator('[class*="SeriesSlider_item-img-wrap"]').first();
  }
}
