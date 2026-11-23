import { Locator, Page, expect, test } from "@playwright/test";
import { Header } from "../components/Header";
import { PRODUCT_URL_RE } from "./ProductPage";

/** URL русской версии: /ru, /ru/, /ru?…, /ru#… */
export const RU_URL_RE = /\/ru(\/|\?|#|$)/;

export class HomePage {
  readonly header: Header;
  /** Кнопка сохранения в баннере выбора языка: «Сақтау» до выбора, «Сохранить» после выбора «Русский» */
  readonly languageSaveButton: Locator;
  /** Линейки главной. Без заглушек загрузки: пока данные не пришли, рисуются скелетоны id="slider_skeleton" */
  readonly sliders: Locator;

  constructor(private readonly page: Page) {
    this.header = new Header(page);
    this.languageSaveButton = page.getByText(/^(Сақтау|Сохранить)$/);
    this.sliders = page.locator('[id^="slider_"]:not([id="slider_skeleton"])');
  }

  /**
   * Главная сразу на русском: открываем /ru. Баннер выбора языка появляется и здесь, причём с
   * предвыбранным казахским: простое «Сохранить» вернуло бы сайт на казахский. Поэтому в баннере
   * выбираем «Русский» (проверку самой смены языка делает только TC-1.1.1).
   */
  async openInRussian() {
    await test.step("Открытие главной на русском (/ru)", async () => {
      await this.page.goto("/ru", { waitUntil: "domcontentloaded" });
      // Баннер подгружается позже остальной страницы и перекрывает контент
      await expect(this.languageSaveButton, "Баннер выбора языка не появился").toBeVisible({ timeout: 20_000 });
      await this.chooseRussianInBanner();
      // Сайт может дозавершать навигацию после сохранения: ждём, пока адрес и язык устоятся на русском
      await expect(this.page).toHaveURL(RU_URL_RE);
      await expect(this.page.locator("html")).toHaveAttribute("lang", "ru");
      await this.page.waitForLoadState("domcontentloaded");
    });
  }

  /** Баннер выбора языка: выбрать «Русский» (если предвыбран казахский) и сохранить */
  async chooseRussianInBanner() {
    const kazakh = this.page.getByText("Қазақша", { exact: true });
    if (await kazakh.isVisible()) {
      await kazakh.click();
      await this.page.getByText("Русский", { exact: true }).click();
    }
    await this.languageSaveButton.click();
    await expect(this.languageSaveButton).toBeHidden();
  }

  /**
   * Смена языка через баннер на начальном экране (TC-1.1.1).
   * У каждого теста свой чистый браузер, поэтому сайт стартует на дефолтном казахском.
   */
  async switchLanguageToRussianViaBanner() {
    await test.step("Смена языка с казахского на русский через баннер", async () => {
      await this.page.goto("/", { waitUntil: "domcontentloaded" });
      // exact: true — иначе getByText ищет подстроку и цепляет названия фильмов («Қазақша бизнес»)
      const kazakh = this.page.getByText("Қазақша", { exact: true });

      await expect(this.languageSaveButton, "Баннер выбора языка не появился").toBeVisible({ timeout: 20_000 });
      await expect(this.page.locator("html"), "Дефолтный язык должен быть казахским").toHaveAttribute("lang", "kk");
      await expect(kazakh, "В баннере должен быть выбран казахский").toBeVisible();

      await kazakh.click();
      await this.page.getByText("Русский", { exact: true }).click();
      await this.languageSaveButton.click();
      // domcontentloaded, а не load: load ждёт все сторонние скрипты и под нагрузкой не успевает
      await this.page.waitForURL(RU_URL_RE, { waitUntil: "domcontentloaded" });
      await expect(this.languageSaveButton, "Баннер выбора языка не закрылся после сохранения").toBeHidden();

      // После «Сохранить» сайт может дозавершать навигацию, и reload её прерывает (net::ERR_ABORTED)
      await expect(async () => {
        await this.page.reload({ waitUntil: "domcontentloaded" });
      }, "Не удалось перезагрузить страницу после сохранения языка").toPass({ timeout: 15_000 });
      await expect(this.page, "После перезагрузки язык сбросился").toHaveURL(RU_URL_RE);
    });
  }

  /**
   * id линеек с карточками фильмов/сериалов (ссылки на /watch/). Остальные линейки ведут
   * в другие разделы: ТВ-архив, подборки. id запоминаем один раз: после goBack страница
   * перерисовывается, и обращение по индексу (nth) ненадёжно.
   */
  async productSliderIds(): Promise<string[]> {
    // Таймаут больше дефолтного: под нагрузкой скелетоны висят дольше 10 сек
    await expect(this.sliders, "На главной нет ни одной линейки").not.toHaveCount(0, { timeout: 20_000 });
    return [
      ...new Set(
        await this.sliders.evaluateAll((els) =>
          els.filter((el) => el.querySelector('a[href*="/watch/"]')).map((el) => el.id),
        ),
      ),
    ];
  }

  /**
   * Открыть первую карточку линейки, выполнить проверки карточки и вернуться на главную.
   * home — адрес главной, на которую возвращаемся (/ru или /ru/kids)
   */
  async openFirstCardAndBack(sliderId: string, home: RegExp, checkCard: () => Promise<void>) {
    const card = this.firstProductCard(sliderId);
    await expect(card).toBeVisible();
    await card.click();
    await this.page.waitForURL(PRODUCT_URL_RE);
    await checkCard();
    await this.page.goBack();
    await this.page.waitForURL(home);
  }

  /** Первая карточка продукта в линейке (не «Смотреть все» и не прочие ссылки) */
  firstProductCard(sliderId: string): Locator {
    return this.page.locator(`[id="${sliderId}"]`).locator('a[href*="/watch/"]').first();
  }
}
