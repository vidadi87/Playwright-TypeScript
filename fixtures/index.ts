import { test as base, expect, Page } from "@playwright/test";
import { Header } from "../components/Header";
import { Player } from "../components/Player";
import { AuthPage } from "../pages/AuthPage";
import { HomePage } from "../pages/HomePage";
import { ProductPage } from "../pages/ProductPage";
import { SearchResultsPage } from "../pages/SearchResultsPage";
import { IGNORED_ERROR_URLS, SITE_URL_RE } from "../test-data/known-errors";

/**
 * Ошибки страницы с начала теста:
 * - необработанные JS-исключения;
 * - ответы с кодом >= 400 от доменов сайта, кроме известного шума (IGNORED_ERROR_URLS).
 * Сторонние сервисы не учитываем, console.error тоже: там дублируются те же ответы сервера.
 */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`JS-ошибка: ${e.message}`));
  page.on("response", (r) => {
    const url = r.url();
    if (r.status() < 400 || !SITE_URL_RE.test(url)) return;
    if (IGNORED_ERROR_URLS.some((re) => re.test(url))) return;
    errors.push(`HTTP ${r.status()}: ${url}`);
  });
  return errors;
}

type Fixtures = {
  /** Ошибки страницы: собираются во всех тестах, прикладываются к отчёту; проверяются там, где этого требует кейс */
  pageErrors: string[];
  /** Главная, уже открытая на русском (/ru) */
  ruHome: HomePage;
  home: HomePage;
  header: Header;
  product: ProductPage;
  player: Player;
  auth: AuthPage;
  searchResults: SearchResultsPage;
};

export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({ page }, use, testInfo) => {
      const errors = collectPageErrors(page);
      await use(errors);
      if (errors.length) {
        await testInfo.attach("page-errors", { body: errors.join("\n"), contentType: "text/plain" });
      }
    },
    { auto: true },
  ],
  home: async ({ page }, use) => use(new HomePage(page)),
  ruHome: async ({ home }, use) => {
    await home.openInRussian();
    await use(home);
  },
  header: async ({ page }, use) => use(new Header(page)),
  product: async ({ page }, use) => use(new ProductPage(page)),
  player: async ({ page }, use) => use(new Player(page)),
  auth: async ({ page }, use) => use(new AuthPage(page)),
  searchResults: async ({ page }, use) => use(new SearchResultsPage(page)),
});

export { expect };

/** Картинки, загрузившиеся с ошибкой (ленивые, которые ещё не грузились, не учитываются) */
export async function expectNoBrokenImages(page: Page) {
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll("img")]
      .filter((img) => img.getAttribute("src") && img.complete && img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.getAttribute("src")),
  );
  expect(broken, "На странице есть незагрузившиеся картинки").toEqual([]);
}
