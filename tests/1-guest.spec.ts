import { test, expect, expectNoBrokenImages } from "../fixtures";
import { RU_URL_RE } from "../pages/HomePage";
import { MOVIE_TITLE_RE, PRODUCT_URL_RE, SERIES_TITLE_RE } from "../pages/ProductPage";
import { AUTH_URL_RE } from "../pages/AuthPage";
import { SEARCH_URL_RE } from "../pages/SearchResultsPage";
import { CONTENT_SEARCH, PRODUCTS } from "../test-data/products";
import { MENU_SECTIONS } from "../test-data/sections";

/**
 * [1] Неавторизованный пользователь.
 * Название теста = ID тест-кейса в Notion (база «Тест-кейсы UnicoPlay Web»): [1.4.1] ↔ TC-1.4.1.
 */
test.describe("[1] Неавторизованный пользователь", () => {
  test("[1.1.1] Смена языка с казахского на русский на начальном экране", async ({ page, home }) => {
    await home.switchLanguageToRussianViaBanner();

    await expect(page).toHaveURL(RU_URL_RE);
    await expect(page.locator("html"), "Язык документа не русский").toHaveAttribute("lang", "ru");
    await home.header.expectRussianMenu();
  });

  test("[1.2.1] Просмотр линеек на главной и открытие карточек фильма и сериала", async ({
    page,
    ruHome,
    product,
    pageErrors,
  }) => {
    const ids = await ruHome.productSliderIds();
    expect(ids.length, "На главной нет ни одной линейки с фильмами/сериалами").toBeGreaterThan(0);

    // Минимум 3 линейки и дальше, пока не откроем и фильм, и сериал
    const MIN_SLIDERS = 3;
    const openedTypes = new Set<"фильм" | "сериал">();
    for (const [i, id] of ids.entries()) {
      if (i >= MIN_SLIDERS && openedTypes.size === 2) break;

      await test.step(`Линейка ${i + 1} (${id}): открытие первой карточки`, async () => {
        const card = ruHome.firstProductCard(id);
        await expect(card).toBeVisible();
        await card.click();

        await page.waitForURL(PRODUCT_URL_RE);
        await expect(product.title, "Карточка не фильма и не сериала").toHaveText(
          new RegExp(`${MOVIE_TITLE_RE.source}|${SERIES_TITLE_RE.source}`),
        );
        openedTypes.add(MOVIE_TITLE_RE.test(await product.title.innerText()) ? "фильм" : "сериал");

        await page.waitForLoadState("load");
        await expectNoBrokenImages(page);

        await page.goBack();
        await page.waitForURL(RU_URL_RE);
      });
    }

    expect([...openedTypes].sort(), "Не удалось открыть и фильм, и сериал из линеек").toEqual(["сериал", "фильм"]);
    expect(pageErrors, "Ошибки при просмотре линеек и карточек").toEqual([]);
  });

  test("[1.3.1] Воспроизведение трейлера с перемоткой до середины", async ({ page, ruHome, product, player }) => {
    await test.step("Открытие первого продукта линейки «Оригиналы»", async () => {
      await ruHome.firstProductCard("slider_originals-ma").click();
      await page.waitForURL(PRODUCT_URL_RE);
    });

    await product.trailerButton.click();
    await player.waitForReady();
    await player.expectPlaying();
    await player.seekToMiddle();
    await player.close();
  });

  test("[1.4.1] Воспроизведение бесплатной серии сериала с перемоткой до середины", async ({
    ruHome,
    product,
    player,
  }) => {
    const series = PRODUCTS.freeEpisodeSeries;
    void ruHome; // язык RU выставлен фикстурой
    await product.open(series.url);
    await expect(product.title, "Продукт из тестовых данных — не сериал").toHaveText(SERIES_TITLE_RE);

    // Без force: перекрывающий кнопку оверлей — это баг, тест должен на нём падать
    await expect(product.playButton).toHaveText("Смотреть бесплатно");
    await product.playButton.click();

    await player.skipPrerollIfPresent();
    await expect(player.title, "В плеере запущена не серия сериала").toHaveText(
      new RegExp(`^${series.title}: \\d+ серия, \\d+ сезон$`),
    );
    await player.waitForReady();
    await player.expectPlaying();
    await player.seekToMiddle();
    await player.close();
  });

  test.describe("[1.5] Попытка воспроизведения платного контента", () => {
    test("[1.5.1.1] Попытка воспроизведения фильма гостем", async ({ page, ruHome, product, player, auth }) => {
      void ruHome;
      await product.open(PRODUCTS.paidMovie.url);
      await expect(product.title).toHaveText(MOVIE_TITLE_RE);

      // Кнопка в карточке, а не «Попробовать бесплатно» в шапке
      await expect(product.playButton).toHaveText("Смотреть бесплатно");
      await product.playButton.click();

      await auth.expectOpened();
      await expect(player.container, "Плеер не должен открываться у гостя").toBeHidden();
      await expect(page).toHaveURL(AUTH_URL_RE);
    });

    test("[1.5.2.1] Попытка воспроизведения платной серии сериала гостем", async ({
      ruHome,
      product,
      player,
      auth,
    }) => {
      const series = PRODUCTS.freeEpisodeSeries;
      void ruHome;
      await product.open(series.url);

      const paidEpisode = product.episode(series.paidEpisodeNumber);
      await paidEpisode.scrollIntoViewIfNeeded();
      await expect(paidEpisode, "Серия из тестовых данных помечена как бесплатная").not.toContainText("БЕСПЛАТНО");

      // Клик по картинке серии (клик по тексту «N серия» открывает страницу серии, это другой сценарий)
      await product.episodeImage(series.paidEpisodeNumber).click();

      await auth.expectOpened();
      await expect(player.container, "Плеер не должен открываться у гостя").toBeHidden();
    });
  });

  test("[1.6.1] Навигация по основным разделам из меню гостем", async ({ page, ruHome, pageErrors }) => {
    for (const section of MENU_SECTIONS) {
      await test.step(`Раздел «${section.menu}»`, async () => {
        await page.goto("/ru", { waitUntil: "domcontentloaded" });
        await ruHome.header.menuLink(section.menu).click();
        await expect(page).toHaveURL(section.url);

        if (section.heading) {
          await expect(page.locator("h1").first(), "Заголовок раздела").toHaveText(section.heading);
        }

        // Карточки контента; для раздела, который бывает пустым, допустим текст «пусто»
        const cards = page.locator(section.cards);
        const emptyText = section.emptyText ? page.getByText(section.emptyText) : null;
        await expect
          .poll(async () => (await cards.count()) > 0 || (emptyText !== null && (await emptyText.isVisible())), {
            message: `В разделе «${section.menu}» нет карточек контента`,
            timeout: 15_000,
          })
          .toBe(true);
      });
    }

    expect(pageErrors, "Ошибки при навигации по разделам").toEqual([]);
  });

  test.describe("[1.7] Поиск", () => {
    test("[1.7.1.1] Поиск контента гостем", async ({ page, ruHome, product, searchResults }) => {
      await ruHome.header.search(CONTENT_SEARCH.query);

      await expect(page).toHaveURL(SEARCH_URL_RE);
      await expect(searchResults.blockHeading("Фильмы и сериалы")).toBeVisible();
      const result = searchResults.productResult(CONTENT_SEARCH.productUrl);
      await expect(result, "Искомого продукта нет в результатах").toContainText(CONTENT_SEARCH.query);

      await result.click();
      await expect(page).toHaveURL(new RegExp(`${CONTENT_SEARCH.productUrl}$`));
      await expect(product.title).toContainText(CONTENT_SEARCH.query);
    });

    test("[1.7.2.1] Поиск персоны гостем", async ({ page, ruHome, product, searchResults }) => {
      void ruHome;
      // Персона берётся из карточки в момент теста, чтобы не зависеть от изменений каталога
      const { name, href } = await test.step("Первый актёр из карточки сериала", async () => {
        await product.open(PRODUCTS.freeEpisodeSeries.url);
        const actor = product.actorLinks.first();
        await expect(actor, "В карточке нет блока «Актеры»").toBeAttached();
        return {
          name: (await actor.innerText()).trim().split("\n")[0].trim(),
          href: (await actor.getAttribute("href"))!,
        };
      });

      await page.goto("/ru", { waitUntil: "domcontentloaded" });
      await ruHome.header.search(name);

      await expect(searchResults.blockHeading("Персоны"), "В результатах нет блока «Персоны»").toBeVisible();
      const person = searchResults.personResult(href);
      await expect(person, `Персоны «${name}» нет в результатах`).toContainText(name);

      await person.click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
    });
  });
});
