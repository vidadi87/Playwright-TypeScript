import type { Page } from "@playwright/test";
import { test, expect, expectNoBrokenImages } from "../fixtures";
import type { AccountMenu } from "../components/AccountMenu";
import { SEARCH_URL_RE } from "../pages/SearchResultsPage";
import { PROFILES_URL_RE } from "../pages/ProfilesPage";
import { AUTHORIZED_PRODUCTS } from "../test-data/products";
import { ACCOUNT_MENU, PROFILES } from "../test-data/profiles";
import { ADULT_SECTIONS, KIDS_SECTIONS } from "../test-data/sections";
import { hasTestAccount } from "../utils/mailbox";

/**
 * [4] Навигация авторизованного пользователя без подписки. Сессия — из tests/auth.setup.ts.
 * Здесь только тесты, которые ничего не меняют в аккаунте: «Буду смотреть» и оценка (4.5, 4.6) —
 * в tests/4-account-changes.spec.ts.
 * Профиль переключается только в своём контексте браузера, поэтому тесты идут параллельно.
 */

const KIDS_HOME_RE = /\/ru\/kids/;
const ADULT_HOME_RE = /\/ru(\/|\?|#|$)/;

/** Главная на русском в основном профиле (он выбран по умолчанию) */
async function openAdultHome(page: Page) {
  await page.goto("/ru", { waitUntil: "domcontentloaded" });
}

/** Главная детского профиля */
async function openKidsHome(page: Page, accountMenu: AccountMenu) {
  await openAdultHome(page);
  await accountMenu.switchTo(PROFILES.kids);
  await expect(page, "Не открылась детская главная").toHaveURL(KIDS_HOME_RE);
}

test.describe("[4] Навигация", () => {
  test.skip(!hasTestAccount(), "Нет TEST_EMAIL и GMAIL_APP_PASSWORD в .env (см. .env.example)");

  test.describe("[4.1] Главная: линейки и карточки", () => {
    test("[4.1.1] Главная: открытие карточек из линеек во взрослом профиле", async ({
      page,
      home,
      product,
      pageErrors,
    }) => {
      await openAdultHome(page);
      const ids = await home.productSliderIds();

      // Минимум 3 линейки и дальше, пока не откроем и фильм, и сериал
      const MIN_SLIDERS = 3;
      const openedTypes = new Set<"фильм" | "сериал">();
      for (const [i, id] of ids.entries()) {
        if (i >= MIN_SLIDERS && openedTypes.size === 2) break;
        await test.step(`Линейка ${i + 1} (${id}): открытие первой карточки`, async () => {
          await home.openFirstCardAndBack(id, ADULT_HOME_RE, async () => {
            // У авторизованного пользователя в карточке нет h1: тип продукта — раздел в хлебных крошках
            await expect(product.breadcrumbs, "Карточка не фильма и не сериала").toHaveText(/^Главная\s*(Фильмы|Сериалы)/);
            openedTypes.add(/^Главная\s*Фильмы/.test(await product.breadcrumbs.innerText()) ? "фильм" : "сериал");
            await page.waitForLoadState("load");
            await expectNoBrokenImages(page);
          });
        });
      }

      expect([...openedTypes].sort(), "Не удалось открыть и фильм, и сериал из линеек").toEqual(["сериал", "фильм"]);
      expect(pageErrors, "Ошибки при просмотре линеек и карточек").toEqual([]);
    });

    test("[4.1.2] Главная: открытие карточек из линеек в детском профиле", async ({
      page,
      home,
      accountMenu,
      product,
      pageErrors,
    }) => {
      await openKidsHome(page, accountMenu);
      const ids = (await home.productSliderIds()).slice(0, 3);
      expect(ids.length, "На детской главной нет линеек с карточками").toBeGreaterThan(0);

      for (const [i, id] of ids.entries()) {
        await test.step(`Линейка ${i + 1} (${id}): открытие первой карточки`, async () => {
          await home.openFirstCardAndBack(id, KIDS_HOME_RE, async () => {
            // У карточек детского профиля нет h1 — признак открытой карточки: данные продукта
            await product.expectDetailsShown();
            await page.waitForLoadState("load");
            await expectNoBrokenImages(page);
          });
        });
      }

      expect(pageErrors, "Ошибки при просмотре линеек и карточек").toEqual([]);
    });
  });

  test.describe("[4.2] Разделы меню", () => {
    const ADULT_IDS: Record<string, string> = { Фильмы: "4.2.1.1", Сериалы: "4.2.2.1", Детям: "4.2.3.1" };
    for (const section of ADULT_SECTIONS) {
      test(`[${ADULT_IDS[section.menu]}] Раздел «${section.menu}» во взрослом профиле`, async ({
        page,
        header,
        sectionPage,
      }) => {
        await openAdultHome(page);
        await header.menuLink(section.menu).click();
        await sectionPage.expectOpened(section);
      });
    }

    const KIDS_IDS: Record<string, string> = { Мультфильмы: "4.2.3.2", Мультсериалы: "4.2.4.1" };
    for (const section of KIDS_SECTIONS) {
      test(`[${KIDS_IDS[section.menu]}] Раздел «${section.menu}» в детском профиле`, async ({
        page,
        header,
        accountMenu,
        sectionPage,
      }) => {
        await openKidsHome(page, accountMenu);
        await header.menuLink(section.menu).click();
        await sectionPage.expectOpened(section);
      });
    }
  });

  test.describe("[4.3] Поиск контента", () => {
    test("[4.3.1] Поиск контента во взрослом профиле", async ({ page, header, product, searchResults }) => {
      const target = AUTHORIZED_PRODUCTS.adultTrailer;
      await openAdultHome(page);
      await header.search(target.title);

      await expect(page).toHaveURL(SEARCH_URL_RE);
      await expect(searchResults.blockHeading("Фильмы и сериалы")).toBeVisible();
      const result = searchResults.productResult(target.url);
      await expect(result, "Искомого продукта нет в результатах").toContainText(target.title);

      await result.click();
      await expect(page).toHaveURL(new RegExp(`${target.url}$`));
      await product.expectDetailsShown();
      await expect(product.breadcrumbs).toContainText(target.title);
    });

    test("[4.3.2] Поиск контента в детском профиле", async ({ page, header, accountMenu, product, searchResults }) => {
      const target = AUTHORIZED_PRODUCTS.kidsFavorite;
      await openKidsHome(page, accountMenu);
      await header.search(target.title);

      await expect(page).toHaveURL(SEARCH_URL_RE);
      await expect(searchResults.blockHeading("Фильмы и сериалы")).toBeVisible();
      const result = searchResults.productResult(target.url);
      await expect(result, "Искомого продукта нет в результатах").toContainText(target.title);

      await result.click();
      await expect(page).toHaveURL(new RegExp(`${target.url}$`));
      await product.expectDetailsShown();
    });
  });

  test("[4.4.1] Поиск персоны во взрослом профиле", async ({ page, header, product, searchResults }) => {
    // Персона берётся из карточки в момент теста, чтобы не зависеть от изменений каталога
    const { name, href } = await test.step("Первый актёр из карточки сериала", async () => {
      await product.open(AUTHORIZED_PRODUCTS.personSource.url, { authorized: true });
      return product.firstActor();
    });

    await openAdultHome(page);
    await header.search(name);

    await expect(searchResults.blockHeading("Персоны"), "В результатах нет блока «Персоны»").toBeVisible();
    const person = searchResults.personResult(href);
    await expect(person, `Персоны «${name}» нет в результатах`).toContainText(name);

    await person.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test.describe("[4.7] Меню аккаунта", () => {
    test("[4.7.1.1] Состав меню аккаунта во взрослом профиле", async ({ page, accountMenu }) => {
      await openAdultHome(page);
      await accountMenu.open();

      await expect(accountMenu.profile(PROFILES.kids), "В меню нет детского профиля").toBeVisible();
      for (const name of [...ACCOUNT_MENU.adultOnly, ...ACCOUNT_MENU.common]) {
        await expect(accountMenu.item(name), `В меню нет «${name}»`).toBeVisible();
      }
      await expect(accountMenu.favoritesItem, "В меню нет «Буду смотреть» со счётчиком").toHaveText(
        new RegExp(`^${ACCOUNT_MENU.adultFavorites}\\s*\\d+$`),
      );
      await expect(accountMenu.logoutButton, "В меню нет «Выйти»").toBeVisible();
    });

    test("[4.7.2.1] Состав меню аккаунта в детском профиле", async ({ page, accountMenu }) => {
      await openKidsHome(page, accountMenu);
      await accountMenu.open();

      await expect(accountMenu.profile(PROFILES.main), "В меню нет основного профиля").toBeVisible();
      for (const name of ACCOUNT_MENU.common) {
        await expect(accountMenu.item(name), `В меню нет «${name}»`).toBeVisible();
      }
      await expect(accountMenu.logoutButton, "В меню нет «Выйти»").toBeVisible();
      for (const name of ACCOUNT_MENU.adultOnly) {
        await expect(accountMenu.item(name), `В меню детского профиля не должно быть «${name}»`).toHaveCount(0);
      }
    });

    test("[4.7.3.1] Подписка, Аккаунт, Устройства из меню аккаунта", async ({ page, accountMenu, pageErrors }) => {
      await openAdultHome(page);

      await test.step("Подписка", async () => {
        await accountMenu.open();
        await accountMenu.item("Подписка").click();
        await expect(page).toHaveURL(/\/account\/subscriptions$/);
        await expect(page.getByText("Подписки", { exact: true }).first(), "Нет хлебных крошек «Подписки»").toBeVisible();
        await expect(page.getByText("Оформить подписку").first(), "Нет «Оформить подписку»").toBeVisible();
      });

      // На странице «Аккаунт» e-mail пользователя: проверяем только заголовки блоков, данные не читаем
      await test.step("Аккаунт", async () => {
        await accountMenu.open();
        await accountMenu.item("Аккаунт").click();
        await expect(page).toHaveURL(/\/account$/);
        for (const block of ["Профиль", "Данные"]) {
          await expect(page.getByText(block, { exact: true }).first(), `Нет блока «${block}»`).toBeVisible();
        }
      });

      await test.step("Устройства", async () => {
        await accountMenu.open();
        await accountMenu.item("Устройства").click();
        await expect(page).toHaveURL(/\/account\/devices$/);
        await expect(page.getByText("Удалить устройство").first(), "Нет списка устройств").toBeVisible();
      });

      expect(pageErrors, "Ошибки на страницах аккаунта").toEqual([]);
    });

    test("[4.7.4.1] Управление профилями из меню аккаунта", async ({ page, accountMenu, profiles }) => {
      await openAdultHome(page);
      await accountMenu.open();
      await accountMenu.item("Управление профилями").click();

      await profiles.expectOpened();
      for (const name of [PROFILES.main, PROFILES.kids]) {
        await expect(profiles.profile(name), `В окне нет профиля «${name}»`).toBeVisible();
      }
      await expect(profiles.addProfileButton, "Нет «Добавить профиль»").toBeVisible();

      await expect(profiles.doneButton, "Нет «Готово»").toBeVisible();

      await profiles.doneButton.click();
      await expect(profiles.chooseTitle, "После «Готово» окно не перешло в режим «Выберите профиль»").toBeVisible();
      await profiles.close();
      await expect(page, "Окно профилей не закрылось").not.toHaveURL(PROFILES_URL_RE);
    });

    test("[4.7.5.1] Поддержка из меню аккаунта во взрослом профиле", async ({ page, accountMenu }) => {
      await openAdultHome(page);
      await accountMenu.open();
      await accountMenu.item("Поддержка").click();

      await expect(page).toHaveURL(/\/account\/support$/);
      await expect(page.getByText("Нужна помощь?", { exact: true })).toBeVisible();
      await expect(page.getByText(/Напишите свой вопрос на \S+@\S+\.\w+/), "Нет адреса почты поддержки").toBeVisible();
    });

    test("[4.7.5.2] Поддержка из меню аккаунта в детском профиле", async ({ page, accountMenu }) => {
      await openKidsHome(page, accountMenu);
      await accountMenu.open();
      await accountMenu.item("Поддержка").click();

      await expect(page).toHaveURL(/\/account\/support$/);
      await expect(page.getByText("Нужна помощь?", { exact: true })).toBeVisible();
      await expect(page.getByText(/Напишите свой вопрос на/)).toBeVisible();
    });
  });
});
