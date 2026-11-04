import { test, expect, Page, Locator } from "@playwright/test";

// =====================================================================
// Константы
// =====================================================================

/* URL русской версии: /ru, /ru/, /ru?..., /ru#... */
const RU_URL_RE = /\/ru(\/|\?|#|$)/;

/* URL карточки продукта */
const PRODUCT_URL_RE = /\/watch\//;

/* Контейнер плеера (трейлер и основной контент) - TODO: сверить в DevTools */
const PLAYER_CONTAINER = "#startPlayerContainer";

const PLAYER_TIMEOUT = 15_000;

// =====================================================================
// Хелперы: навигация
// =====================================================================

/**
 * Смена языка интерфейса с казахского (дефолт) на русский.
 * Вызывается в начале КАЖДОГО теста. У каждого теста свой чистый
 * BrowserContext (без cookies/localStorage), поэтому сайт всегда
 * стартует на дефолтном казахском языке.
 */
async function switchLanguageToRussian(page: Page) {
  await test.step("Смена языка с казахского на русский", async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Баннер выбора языка подгружается позже остальной страницы.
    // exact: true - иначе getByText ищет подстроку и цепляет названия фильмов ("Қазақша бизнес")
    const kazakhSwitcher = page.getByText("Қазақша", { exact: true });
    // Кнопка сохранения меняет текст: "Сақтау" до выбора языка, "Сохранить" сразу после выбора "Русский"
    const saveButton = page.getByText(/^(Сақтау|Сохранить)$/);

    // Ждем появления баннера (не пауза: проверка пройдет сразу, как только он отрисуется)
    await expect(saveButton, "Баннер выбора языка не появился").toBeVisible({ timeout: 20_000 });

    // Предусловие: стартовый язык - казахский
    await expect(kazakhSwitcher, "Дефолтный язык должен быть казахским").toBeVisible();

    await kazakhSwitcher.click();
    await page.getByText("Русский", { exact: true }).click();
    await saveButton.click();

    await page.waitForURL(RU_URL_RE);

    // Выбор сохранен: баннер закрылся, и после перезагрузки сайт остается на русском
    await expect(saveButton, "Баннер выбора языка не закрылся после сохранения").toBeHidden();
    // После "Сохранить" сайт может еще дозавершать свою навигацию, и reload ее прерывает
    // (net::ERR_ABORTED). toPass повторяет reload, пока он не пройдет без прерывания
    await expect(async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
    }, "Не удалось перезагрузить страницу после сохранения языка").toPass({ timeout: 15_000 });
    await expect(page, "После перезагрузки язык сбросился").toHaveURL(RU_URL_RE);
  });
}

/** Открытие карточки первого продукта из линейки "Оригиналы" */
async function openFirstProduct(page: Page) {
  await test.step("Открытие карточки первого продукта", async () => {
    const firstProduct = page.locator("#slider_originals-ma").getByRole("link").first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.click();
    await page.waitForURL(PRODUCT_URL_RE);
  });
}

// =====================================================================
// Хелперы: плеер
// =====================================================================

/**
 * <video> внутри контейнера плеера.
 * Не берем глобальный document.querySelector("video"): на странице продукта
 * может быть фоновое превью-видео, и проверки уйдут не в тот элемент.
 */
function playerVideo(page: Page): Locator {
  return page.locator(`${PLAYER_CONTAINER} video`).first();
}

/** Ожидание готовности видео: элемент виден, метаданные загружены (duration > 0) */
async function waitForVideoReady(video: Locator) {
  await test.step("Ожидание загрузки видео", async () => {
    await expect(video).toBeVisible({ timeout: PLAYER_TIMEOUT });
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.duration), {
        message: "Плеер не отдал валидную длительность",
        timeout: PLAYER_TIMEOUT,
      })
      .toBeGreaterThan(0); // NaN > 0 === false, поэтому poll ждет реальное значение
  });
}

/** Проверка, что видео реально воспроизводится: currentTime растет */
async function expectVideoIsPlaying(video: Locator, minAdvanceSec = 1) {
  const start = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  try {
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
        message: "Видео не воспроизводится: currentTime не растет",
        timeout: PLAYER_TIMEOUT,
      })
      .toBeGreaterThan(start + minAdvanceSec);
  } catch (e) {
    // Состояние плеера в момент падения: на паузе или застряло на буферизации
    const state = await video.evaluate((v: HTMLVideoElement) => ({
      currentTime: v.currentTime,
      paused: v.paused,
      ended: v.ended,
      readyState: v.readyState, // < 3 - не хватает данных для воспроизведения
      networkState: v.networkState,
      error: v.error ? v.error.code : null,
    }));
    throw new Error(`${(e as Error).message}\nСостояние video: ${JSON.stringify(state)}`);
  }
}

/** Перемотка на середину и проверка, что воспроизведение продолжилось с новой позиции */
async function seekToMiddle(video: Locator) {
  await test.step("Перемотка на середину", async () => {
    const duration = await video.evaluate((v: HTMLVideoElement) => v.duration);
    expect(Number.isFinite(duration), "Длительность должна быть конечной (не live-поток)").toBe(true);

    const target = duration / 2;
    await video.evaluate((v: HTMLVideoElement, t: number) => {
      v.currentTime = t;
    }, target);

    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
        message: "Позиция воспроизведения не сместилась после перемотки",
        timeout: 5_000,
      })
      .toBeGreaterThanOrEqual(target - 0.5);

    // Сегменты с новой позиции подгрузились и видео идет дальше
    await expectVideoIsPlaying(video);
  });
}

/** Пропуск преролла, если он появился */
async function skipPrerollIfPresent(page: Page) {
  const skipBtn = page.getByText("Пропустить");
  try {
    await skipBtn.waitFor({ state: "visible", timeout: 5_000 });
    await skipBtn.click();
  } catch {
    // Преролла нет - продолжаем
  }
}

/** Закрытие плеера по крестику с обязательной проверкой, что плеер исчез */
async function closePlayer(page: Page) {
  await test.step("Закрытие плеера", async () => {
    const container = page.locator(PLAYER_CONTAINER);

    // Контролы плеера скрываются автоматически - показываем их наведением.
    // Если контролы появляются только по клику, заменить hover на клик по #middle
    await container.hover();

    const closeBtn = page.getByRole("img", { name: "Close player" });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    await expect(container, "Плеер не закрылся").toBeHidden({ timeout: 5_000 });
  });
}

// =====================================================================
// [1] Неавторизованный пользователь
// =====================================================================

test.describe("[1] Неавторизованный пользователь", () => {
  test("[1.1] Смена языка локализации с дефолтного на русский язык на начальном экране", async ({ page }) => {
    await switchLanguageToRussian(page);

    await expect(page).toHaveURL(RU_URL_RE);
    // Интерфейс реально переключился, а не только URL.
    // TODO: заменить на надежный маркер, например html[lang="ru"], если он есть
    await expect(page.getByText("Қазақша")).toBeHidden();
  });

  test("[1.2] Переход в карточку первого продукта", async ({ page }) => {
    await switchLanguageToRussian(page);
    await openFirstProduct(page);

    await expect(page).toHaveURL(PRODUCT_URL_RE);
    // TODO: сверить маркер карточки (заголовок продукта)
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("[1.3] Просмотр линеек на главном экране, открытие карточек продуктов (фильмы/сериалы)", async ({ page }) => {
    await switchLanguageToRussian(page);

    // TODO: сверить, что все линейки имеют id с префиксом slider_
    // Исключаем заглушки загрузки: пока данные не пришли, на месте карточек рисуются
    // скелетоны с id="slider_skeleton", и они тоже подходят под [id^=slider_]
    const sliders = page.locator('[id^="slider_"]:not([id="slider_skeleton"])');
    await expect(sliders, "На главной нет ни одной линейки").not.toHaveCount(0);

    // Запоминаем id линеек один раз. Обращение по индексу (nth) ненадежно: после goBack
    // страница перерисовывается, и nth(i) может указать на другой или удаленный элемент.
    // Берем только линейки с фильмами/сериалами (ссылки на /watch/). Остальные линейки
    // ведут в другие разделы: ТВ-архив (/archive/), подборки (/collection/) и т.д.
    // Set - на случай, если id повторяется
    const ids = [
      ...new Set(
        await sliders.evaluateAll((els) =>
          els.filter((el) => el.querySelector('a[href*="/watch/"]')).map((el) => el.id),
        ),
      ),
    ];
    expect(ids.length, "На главной нет ни одной линейки с фильмами/сериалами").toBeGreaterThan(0);

    // Проверяем первые 3 линейки, чтобы тест не был слишком долгим
    for (const [i, id] of ids.slice(0, 3).entries()) {
      await test.step(`Линейка ${i + 1} (${id}): отображение и открытие первой карточки`, async () => {
        const slider = page.locator(`[id="${id}"]`);
        // Без scrollIntoViewIfNeeded: click сам прокручивает к элементу и повторяет попытку,
        // если элемент перерисовался
        await expect(slider).toBeAttached();

        // Первая карточка продукта, а не любая ссылка в линейке (например "Смотреть все")
        const firstCard = slider.locator('a[href*="/watch/"]').first();
        await expect(firstCard).toBeVisible();
        await firstCard.click();

        await page.waitForURL(PRODUCT_URL_RE);
        await expect(page.locator("h1").first()).toBeVisible();

        await page.goBack();
        await page.waitForURL(RU_URL_RE);
      });
    }
  });

  test("[1.4] Воспроизведение трейлеров", async ({ page }) => {
    await switchLanguageToRussian(page);
    await openFirstProduct(page);

    const trailerBtn = page.getByText("Трейлер").first();
    await expect(trailerBtn).toBeVisible();
    await trailerBtn.click();

    const video = playerVideo(page);
    await waitForVideoReady(video);
    await expectVideoIsPlaying(video);
    await seekToMiddle(video);
    await closePlayer(page);
  });

  test("[1.5] Воспроизведение продукта (бесплатная серия сериала)", async ({ page }) => {
    await switchLanguageToRussian(page);
    // TODO: открывать заведомо сериал с бесплатной серией (по id/URL из тестовых данных),
    // сейчас открывается первый продукт линейки "Оригиналы"
    await openFirstProduct(page);

    const playFreeBtn = page.getByText("Смотреть бесплатно", { exact: true }).first();
    await expect(playFreeBtn).toBeVisible();
    // Без force: перекрывающий кнопку оверлей - это баг, тест должен на нем падать
    await playFreeBtn.click();

    await skipPrerollIfPresent(page);

    const video = playerVideo(page);
    await waitForVideoReady(video);
    await expectVideoIsPlaying(video);
    await seekToMiddle(video);
    await closePlayer(page);
  });
});