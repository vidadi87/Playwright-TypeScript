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
  /** Иконка «Буду смотреть» рядом с «Трейлером»: favorites.svg ↔ favorites-select.svg */
  readonly favoritesIcon: Locator;
  readonly likeButton: Locator;
  readonly dislikeButton: Locator;
  /** Строка с данными продукта: рейтинг, год, длительность или сезоны, возрастной рейтинг, жанры, страны */
  readonly details: Locator;
  /** Хлебные крошки: «Главная › Фильмы › Детектив › Достать ножи» */
  readonly breadcrumbs: Locator;

  constructor(private readonly page: Page) {
    this.title = page.locator("h1").first();
    this.playButton = page.locator('[class*="TopBlock_TopBlock__button-play"]').first();
    this.trailerButton = page.getByText("Трейлер").first();
    this.episodes = page.locator("#series").locator('[class*="SeriesSlider_item-wrap"]');
    // Первая ссылка блока — «Актеры и съемочная группа» (/watch/…/person), персоны — /ru/person/…
    this.actorLinks = page.locator('#persons a[href^="/ru/person/"]');
    this.favoritesIcon = page.getByRole("img", { name: "favorites" }).first();
    this.likeButton = page.getByRole("button", { name: "like Нравится" });
    this.dislikeButton = page.getByRole("button", { name: "dislike Не нравится" });
    this.details = page.locator('[class*="TopBlock_TopBlock__description-short"]').first();
    this.breadcrumbs = page.locator('[class*="BreadCrumbs_breadcrumbs_wrapper"]').first();
  }

  async isFavorite(): Promise<boolean> {
    return /favorites-select/.test((await this.favoritesIcon.getAttribute("src")) ?? "");
  }

  /** Установить состояние «Буду смотреть» (клик только если оно отличается) */
  async setFavorite(value: boolean) {
    if ((await this.isFavorite()) !== value) await this.favoritesIcon.click();
    await expect.poll(() => this.isFavorite(), { message: "Иконка «Буду смотреть» не переключилась" }).toBe(value);
  }

  /** Оценка активна — иконка like-active.svg / dislike-active.svg */
  async isRatingActive(button: Locator): Promise<boolean> {
    return /-active\.svg/.test((await button.locator("img").getAttribute("src")) ?? "");
  }

  /** Карточка открылась и показывает данные продукта (у авторизованного пользователя в карточке нет h1) */
  async expectDetailsShown() {
    await expect(this.details, "В карточке нет данных продукта").toBeVisible();
    await expect(this.details, "В данных продукта нет возрастного рейтинга").toContainText(/\d+\+/);
  }

  /**
   * Открыть карточку. У гостя признак открытой карточки — заголовок h1 («Фильм …»), у авторизованного
   * пользователя h1 нет (вместо него логотип-картинка) — там ждём данные продукта
   */
  async open(url: string, { authorized = false } = {}) {
    if (!authorized) {
      await this.page.goto(url, { waitUntil: "domcontentloaded" });
      await expect(this.title).toBeVisible();
      return;
    }
    // Состояние иконки «Буду смотреть» приходит отдельным запросом списка избранного профиля:
    // до его ответа иконка показывает «не добавлено», даже если продукт в списке
    const favoritesLoaded = this.page.waitForResponse(
      (r) => /\/profile\/favorites\/[^/?]+/.test(r.url()) && r.request().method() === "GET",
      { timeout: 20_000 },
    );
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    await this.expectDetailsShown();
    // Карточка сначала рисуется как у гостя и становится авторизованной после обновления сессии.
    // Клик по «Буду смотреть» или оценке до этого момента не сохраняется, а шапка остаётся гостевой
    await expect(
      this.page.locator('[class*="headerMenu_avatar_authorized"]').first(),
      "Карточка не перешла в режим авторизованного пользователя",
    ).toBeVisible({ timeout: 15_000 });
    await favoritesLoaded;
    await this.waitForFavoriteIconSettled();
  }

  /** Иконка «Буду смотреть» перерисовывается после ответа сервера: ждём, пока она перестанет меняться */
  private async waitForFavoriteIconSettled() {
    let previous: boolean | undefined;
    await expect
      .poll(
        async () => {
          const current = await this.isFavorite();
          const stable = current === previous;
          previous = current;
          return stable;
        },
        { intervals: [500], timeout: 10_000 },
      )
      .toBe(true);
  }

  /** Первый актёр из блока «Актеры»: имя и адрес страницы персоны */
  async firstActor(): Promise<{ name: string; href: string }> {
    const actor = this.actorLinks.first();
    await expect(actor, "В карточке нет блока «Актеры»").toBeAttached();
    return {
      name: (await actor.innerText()).trim().split("\n")[0].trim(),
      href: (await actor.getAttribute("href"))!,
    };
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
