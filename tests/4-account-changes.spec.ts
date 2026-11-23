import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import type { AccountMenu } from "../components/AccountMenu";
import type { Header } from "../components/Header";
import type { ProductPage } from "../pages/ProductPage";
import { AUTHORIZED_PRODUCTS } from "../test-data/products";
import { PROFILES } from "../test-data/profiles";
import { hasTestAccount } from "../utils/mailbox";

/**
 * [4.5] «Буду смотреть» и [4.6] оценка контента. Оба меняют данные профиля на сервере, поэтому:
 * - файл идёт отдельным проектом после остальных тестов авторизованного пользователя (playwright.config.ts);
 * - тесты внутри файла идут по очереди (4.5.1 и 4.5.2 работают с одним продуктом);
 * - «Буду смотреть» в конце возвращается в исходное состояние. Оценку снять нельзя (повторное нажатие
 *   её не снимает) — тесты 4.6 оставляют «Не нравится».
 */
test.describe.configure({ mode: "default" });

type Profile = "adult" | "kids";

const FAVORITES_URL_RE = /\/favorites$/;

/** Открыть карточку продукта в нужном профиле */
async function openProduct(
  page: Page,
  header: Header,
  accountMenu: AccountMenu,
  product: ProductPage,
  profile: Profile,
  url: string,
) {
  await page.goto("/ru", { waitUntil: "domcontentloaded" });
  await header.expectLoggedIn();
  if (profile === "kids") await accountMenu.switchTo(PROFILES.kids);
  await product.open(url, { authorized: true });
}

/** Адреса карточек в списке «Буду смотреть» (переход через пункт меню шапки) */
async function favoritesList(page: Page, header: Header): Promise<string[]> {
  await header.favoritesLink.first().click();
  await expect(page).toHaveURL(FAVORITES_URL_RE);
  // Список грузится после заголовка: ждём, пока число карточек перестанет меняться
  const cards = page.locator('a[href*="/watch/"]');
  let previous = -1;
  await expect
    .poll(
      async () => {
        const count = await cards.count();
        const stable = count === previous;
        previous = count;
        return stable;
      },
      { intervals: [1_000], timeout: 15_000 },
    )
    .toBe(true);
  return [...new Set(await cards.evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? "")))];
}

test.describe("[4] Навигация: изменения профиля", () => {
  test.skip(!hasTestAccount(), "Нет TEST_EMAIL и GMAIL_APP_PASSWORD в .env (см. .env.example)");

  const CASES: Array<{ profile: Profile; add: string; remove: string; url: string; name: string }> = [
    { profile: "adult", add: "4.5.1.1", remove: "4.5.2.1", url: AUTHORIZED_PRODUCTS.adultFavorite.url, name: "взрослом" },
    { profile: "kids", add: "4.5.1.2", remove: "4.5.2.2", url: AUTHORIZED_PRODUCTS.kidsFavorite.url, name: "детском" },
  ];

  test.describe("[4.5] Буду смотреть", () => {
    for (const c of CASES) {
      test(`[${c.add}] Добавление в «Буду смотреть» в ${c.name} профиле`, async ({
        page,
        header,
        accountMenu,
        product,
      }) => {
        await openProduct(page, header, accountMenu, product, c.profile, c.url);
        await test.step("Предусловие: продукта нет в «Буду смотреть»", () => product.setFavorite(false));

        try {
          await product.favoritesIcon.click();
          await expect.poll(() => product.isFavorite(), { message: "Иконка «Буду смотреть» не стала активной" }).toBe(true);

          expect(await favoritesList(page, header), "Продукта нет в списке «Буду смотреть»").toContain(c.url);
        } finally {
          await test.step("Возврат состояния: убрать продукт из «Буду смотреть»", async () => {
            await product.open(c.url, { authorized: true });
            await product.setFavorite(false);
          });
        }
      });

      test(`[${c.remove}] Удаление из «Буду смотреть» в ${c.name} профиле`, async ({
        page,
        header,
        accountMenu,
        product,
      }) => {
        await openProduct(page, header, accountMenu, product, c.profile, c.url);
        await test.step("Предусловие: продукт в «Буду смотреть»", () => product.setFavorite(true));
        const before = await favoritesList(page, header);
        await product.open(c.url, { authorized: true });

        await product.favoritesIcon.click();
        await expect.poll(() => product.isFavorite(), { message: "Иконка «Буду смотреть» не стала неактивной" }).toBe(false);

        const after = await favoritesList(page, header);
        expect(after, "Продукт остался в списке «Буду смотреть»").not.toContain(c.url);
        expect(after.sort(), "Изменились другие элементы списка").toEqual(before.filter((u) => u !== c.url).sort());
      });
    }
  });

  test.describe("[4.6] Оценка контента", () => {
    const RATING_CASES = [
      { id: "4.6.1", profile: "adult" as const, url: AUTHORIZED_PRODUCTS.adultFavorite.url, name: "взрослом" },
      { id: "4.6.2", profile: "kids" as const, url: AUTHORIZED_PRODUCTS.kidsFavorite.url, name: "детском" },
    ];

    for (const c of RATING_CASES) {
      test(`[${c.id}] Оценка контента в ${c.name} профиле`, async ({ page, header, accountMenu, product }) => {
        await openProduct(page, header, accountMenu, product, c.profile, c.url);
        const expectRating = async (like: boolean, message: string) => {
          await expect.poll(() => product.isRatingActive(product.likeButton), { message }).toBe(like);
          await expect.poll(() => product.isRatingActive(product.dislikeButton), { message }).toBe(!like);
        };

        await test.step("«Нравится» и перезагрузка", async () => {
          await product.likeButton.click();
          await expectRating(true, "«Нравится» не стала активной");
          await product.open(c.url, { authorized: true });
          await expectRating(true, "«Нравится» не сохранилась после перезагрузки");
        });

        await test.step("Повторное «Нравится» оценку не снимает", async () => {
          await product.likeButton.click();
          await expectRating(true, "Повторное нажатие сняло оценку");
          // Сразу после клика состояние могло ещё не смениться — сверяем с сохранённым на сервере
          await product.open(c.url, { authorized: true });
          await expectRating(true, "Повторное нажатие сняло оценку (после перезагрузки)");
        });

        await test.step("«Не нравится» и перезагрузка", async () => {
          await product.dislikeButton.click();
          await expectRating(false, "«Не нравится» не стала активной");
          await product.open(c.url, { authorized: true });
          await expectRating(false, "«Не нравится» не сохранилась после перезагрузки");
        });
      });
    }
  });
});
