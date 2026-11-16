import { test, expect, Page, Locator } from "@playwright/test";

// =====================================================================
// Константы
// =====================================================================

/* URL русской версии: /ru, /ru/, /ru?..., /ru#... */
const RU_URL_RE = /\/ru(\/|\?|#|$)/;

/* URL карточки продукта */
const PRODUCT_URL_RE = /\/watch\//;

/* Заголовок карточки продукта начинается с типа: "Фильм Достать ножи – смотреть онлайн",
   "Сериал Черная икра – смотреть онлайн" */
const MOVIE_TITLE_RE = /^Фильм /;
const SERIES_TITLE_RE = /^Сериал /;

/* Тестовые данные: сериал с бесплатной серией (кнопка "Смотреть бесплатно" для гостя) */
const FREE_EPISODE_SERIES_URL = "/ru/watch/chernaya-ikra";

/* Плеер: один и тот же для трейлера и основного контента */
const PLAYER_CONTAINER = "#startPlayerContainer";
const MAIN_VIDEO = "#startVideo";
/* Классы - CSS-модули с хэшем в конце (StartPlayerProgress_root__bar___FEuE),
   хэш меняется при пересборке сайта, поэтому ищем по началу имени класса */
const PLAYER_TITLE = '[class*="MainPlayer_title"]'; // "Черная икра: 1 серия, 1 сезон"
const PROGRESS_BAR = '[class*="StartPlayerProgress_root__bar"]';
const PROGRESS_CURRENT_TIME = '[class*="StartPlayerProgress_root__start"]'; // "27:08"

const PLAYER_TIMEOUT = 15_000;

/* Преролл (рекламный ролик перед контентом) */
const PROMO_WRAPPER = "#promoWrapper";
/* Максимум ожидания кнопки "Пропустить" (появляется после отсчета) или окончания преролла */
const PREROLL_TIMEOUT = 30_000;
/* Основное видео считаем стартовавшим, если оно ушло дальше этой отметки (сек):
   до показа преролла оно успевает проиграть ~0.2 сек и встает на паузу */
const MAIN_STARTED_SEC = 1;

/* Допустимая позиция после клика по середине полосы прогресса (доля длительности).
   Верхняя граница с запасом: видео продолжает идти, пока выполняется проверка */
const SEEK_MIDDLE_MIN = 0.4;
const SEEK_MIDDLE_MAX = 0.65;

/*
 * Ответы сайта с ошибкой, которые не являются поломкой (проверено вручную):
 * - /monitoring - отправка статистики мониторинга, всегда 403
 * - /auth/refresh - обновление сессии, у неавторизованного пользователя всегда 401
 * - /multiplex/selections/ - данные линейки; 404, если линейка отключена для этого
 *   пользователя (виртуальный взрослый). Это не ошибка
 */
const IGNORED_ERROR_URLS = [/\/monitoring\?/, /\/auth\/refresh/, /\/multiplex\/selections\//];

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
    await expect(page.locator("html"), "Дефолтный язык должен быть казахским").toHaveAttribute("lang", "kk");
    await expect(kazakhSwitcher, "В баннере должен быть выбран казахский").toBeVisible();

    await kazakhSwitcher.click();
    await page.getByText("Русский", { exact: true }).click();
    await saveButton.click();

    // domcontentloaded, а не дефолтный load: load ждет все сторонние скрипты и картинки
    // и под нагрузкой не успевает за 30 сек. Полную загрузку проверяет reload ниже
    await page.waitForURL(RU_URL_RE, { waitUntil: "domcontentloaded" });

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

/** Заголовок карточки продукта (h1) */
function productTitle(page: Page): Locator {
  return page.locator("h1").first();
}

// =====================================================================
// Хелперы: ошибки страницы
// =====================================================================

/**
 * Сбор ошибок страницы с момента вызова:
 * - необработанные JS-исключения;
 * - ответы с кодом >= 400 от доменов сайта (*.unicoplay.com), кроме IGNORED_ERROR_URLS.
 * Сторонние сервисы (счетчики, реклама) не проверяем: их сбои - не ошибки сайта.
 * Сообщения console.error тоже не проверяем: там дублируются те же ответы сервера.
 */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`JS-ошибка: ${e.message}`));
  page.on("response", (r) => {
    const url = r.url();
    if (r.status() < 400) return;
    if (!/^https:\/\/([\w-]+\.)*unicoplay\.com\//.test(url)) return;
    if (IGNORED_ERROR_URLS.some((re) => re.test(url))) return;
    errors.push(`HTTP ${r.status()}: ${url}`);
  });
  return errors;
}

/** Картинки, которые загрузились с ошибкой (не путать с ленивыми, которые еще не грузились) */
async function expectNoBrokenImages(page: Page) {
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll("img")]
      .filter((img) => img.getAttribute("src") && img.complete && img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.getAttribute("src")),
  );
  expect(broken, "На странице есть незагрузившиеся картинки").toEqual([]);
}

// =====================================================================
// Хелперы: плеер
// =====================================================================

/**
 * Основное <video> плеера.
 * Не берем глобальный document.querySelector("video"): на странице продукта
 * может быть фоновое превью-видео, а во время преролла в плеере есть еще #promoVideo.
 */
function playerVideo(page: Page): Locator {
  return page.locator(`${PLAYER_CONTAINER} ${MAIN_VIDEO}`);
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

/** "27:08" / "1:02:03" -> секунды */
function parseTimecode(text: string): number {
  return text
    .trim()
    .split(":")
    .reduce((acc, part) => acc * 60 + Number(part), 0);
}

/**
 * Перемотка на середину кликом по полосе прогресса, как это делает пользователь.
 * Проверяем, что позиция видео и время в интерфейсе плеера сместились к середине,
 * и что воспроизведение продолжилось с новой позиции.
 */
async function seekToMiddle(page: Page, video: Locator) {
  await test.step("Перемотка на середину кликом по полосе прогресса", async () => {
    const duration = await video.evaluate((v: HTMLVideoElement) => v.duration);
    expect(Number.isFinite(duration), "Длительность должна быть конечной (не live-поток)").toBe(true);

    // Контролы плеера скрываются автоматически - показываем их наведением на плеер
    await page.locator(PLAYER_CONTAINER).hover();
    const bar = page.locator(PROGRESS_BAR);
    await expect(bar, "Полоса прогресса не отображается").toBeVisible();

    const box = await bar.boundingBox();
    expect(box, "Не удалось определить размеры полосы прогресса").not.toBeNull();
    await bar.click({ position: { x: box!.width / 2, y: box!.height / 2 } });

    const position = () => video.evaluate((v: HTMLVideoElement) => v.currentTime / v.duration);
    await expect
      .poll(position, {
        message: "Позиция воспроизведения не сместилась к середине после клика по полосе прогресса",
        timeout: 5_000,
      })
      .toBeGreaterThanOrEqual(SEEK_MIDDLE_MIN);
    expect(await position(), "Перемотка ушла дальше середины").toBeLessThanOrEqual(SEEK_MIDDLE_MAX);

    // Время в интерфейсе плеера тоже показывает середину. Плеер обновляет его не сразу
    // после перемотки (может показывать старое "00:02"), поэтому ждем, а не читаем один раз
    const shownPosition = async () => {
      await page.locator(PLAYER_CONTAINER).hover(); // время видно только вместе с контролами
      return parseTimecode(await page.locator(PROGRESS_CURRENT_TIME).innerText()) / duration;
    };
    await expect
      .poll(shownPosition, { message: "Время в плеере не сместилось к середине видео", timeout: 5_000 })
      .toBeGreaterThanOrEqual(SEEK_MIDDLE_MIN);
    expect(await shownPosition(), "Время в плеере ушло дальше середины").toBeLessThanOrEqual(SEEK_MIDDLE_MAX);

    // Сегменты с новой позиции подгрузились и видео идет дальше
    await expectVideoIsPlaying(video);
  });
}

/**
 * Пропуск преролла (рекламного ролика перед контентом), если он есть.
 *
 * Разметка (снята из trace):
 *   #startPlayerContainer
 *     video#startVideo          - основное видео, на паузе (~0.2 сек), пока идет преролл
 *     figure#promoWrapper       - преролл, есть в DOM только пока он показывается
 *       video#promoVideo
 *       div "Пропустить" + img[alt=promo_skip] - появляется не сразу, а после отсчета (~5-8 сек)
 *
 * Преролл есть не на всех продуктах и не всегда, поэтому сначала ждем, что стартует раньше:
 * преролл или основное видео. Основное видео может проиграть долю секунды до появления
 * преролла, поэтому считаем его стартовавшим только после MAIN_STARTED_SEC.
 */
async function skipPrerollIfPresent(page: Page) {
  await test.step("Пропуск преролла (если есть)", async () => {
    const promo = page.locator(PROMO_WRAPPER);

    let started: "promo" | "main" | null = null;
    await expect
      .poll(
        async () => {
          if (await promo.isVisible()) return (started = "promo");
          // page.evaluate, а не locator.evaluate: тот ждет появления элемента до actionTimeout
          const mainTime = await page.evaluate(
            (sel) => document.querySelector<HTMLVideoElement>(sel)?.currentTime ?? 0,
            MAIN_VIDEO,
          );
          if (mainTime > MAIN_STARTED_SEC) return (started = "main");
          return null;
        },
        { message: "Не стартовал ни преролл, ни основное видео", timeout: PLAYER_TIMEOUT },
      )
      .not.toBeNull();

    if (started === "main") return; // преролла нет

    // Ждем кнопку "Пропустить" или окончания преролла (короткий ролик может закончиться сам).
    // exact: true - чтобы не кликнуть по тексту отсчета, если он вида "Пропустить через 5"
    const skipBtn = promo.getByText("Пропустить", { exact: true });
    await expect
      .poll(
        async () => (await skipBtn.isVisible()) || !(await promo.isVisible()),
        { message: "Кнопка 'Пропустить' не появилась, преролл не закончился", timeout: PREROLL_TIMEOUT },
      )
      .toBe(true);

    if (await promo.isVisible()) await skipBtn.click();
    await expect(promo, "Преролл не закрылся после 'Пропустить'").toBeHidden({ timeout: 5_000 });
  });
}

/** Закрытие плеера по крестику с обязательной проверкой, что плеер исчез */
async function closePlayer(page: Page) {
  await test.step("Закрытие плеера", async () => {
    const container = page.locator(PLAYER_CONTAINER);

    // Контролы плеера скрываются автоматически - показываем их наведением.
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
    // Интерфейс реально переключился, а не только URL: язык документа и пункты меню
    await expect(page.locator("html"), "Язык документа не русский").toHaveAttribute("lang", "ru");
    for (const name of ["Фильмы", "Сериалы"]) {
      await expect(
        page.getByRole("link", { name, exact: true }).first(),
        `В меню нет пункта "${name}" на русском`,
      ).toBeVisible();
    }
  });

  test("[1.2] Переход в карточку первого продукта", async ({ page }) => {
    await switchLanguageToRussian(page);
    await openFirstProduct(page);

    await expect(page).toHaveURL(PRODUCT_URL_RE);
    await expect(productTitle(page)).toBeVisible();
  });

  test("[1.3] Просмотр линеек на главном экране, открытие карточек продуктов (фильмы/сериалы)", async ({ page }) => {
    // Ошибки собираем с самого начала: и на главной, и в карточках
    const errors = collectPageErrors(page);
    await switchLanguageToRussian(page);

    // Исключаем заглушки загрузки: пока данные не пришли, на месте карточек рисуются
    // скелетоны с id="slider_skeleton", и они тоже подходят под [id^=slider_]
    const sliders = page.locator('[id^="slider_"]:not([id="slider_skeleton"])');
    // Таймаут больше дефолтного: под нагрузкой скелетоны висят дольше 10 сек
    await expect(sliders, "На главной нет ни одной линейки").not.toHaveCount(0, { timeout: 20_000 });

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

    // Проверяем минимум 3 линейки и идем дальше, пока не откроем и фильм, и сериал
    const MIN_SLIDERS = 3;
    const openedTypes = new Set<"фильм" | "сериал">();
    for (const [i, id] of ids.entries()) {
      if (i >= MIN_SLIDERS && openedTypes.size === 2) break;

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
        const title = productTitle(page);
        await expect(title).toBeVisible();
        await expect(title, "Карточка не фильма и не сериала").toHaveText(
          new RegExp(`${MOVIE_TITLE_RE.source}|${SERIES_TITLE_RE.source}`),
        );
        openedTypes.add(MOVIE_TITLE_RE.test(await title.innerText()) ? "фильм" : "сериал");

        // Карточка загрузилась без ошибок: постер и прочие картинки на месте
        await page.waitForLoadState("load");
        await expectNoBrokenImages(page);

        await page.goBack();
        await page.waitForURL(RU_URL_RE);
      });
    }

    expect([...openedTypes].sort(), "Не удалось открыть и фильм, и сериал из линеек").toEqual(["сериал", "фильм"]);
    expect(errors, "Ошибки при просмотре линеек и карточек").toEqual([]);
  });

  test("[1.4] Воспроизведение трейлера с перемоткой до середины видео", async ({ page }) => {
    await switchLanguageToRussian(page);
    await openFirstProduct(page);

    const trailerBtn = page.getByText("Трейлер").first();
    await expect(trailerBtn).toBeVisible();
    await trailerBtn.click();

    const video = playerVideo(page);
    await waitForVideoReady(video);
    await expectVideoIsPlaying(video);
    await seekToMiddle(page, video);
    await closePlayer(page);
  });

  test("[1.5] Воспроизведение продукта (бесплатная серия сериала) с перемоткой видео до середины", async ({ page }) => {
    await switchLanguageToRussian(page);

    await test.step("Открытие сериала с бесплатной серией", async () => {
      await page.goto(FREE_EPISODE_SERIES_URL, { waitUntil: "domcontentloaded" });
      await expect(productTitle(page), "Продукт из тестовых данных - не сериал").toHaveText(SERIES_TITLE_RE);
    });

    const playFreeBtn = page.getByText("Смотреть бесплатно", { exact: true }).first();
    await expect(playFreeBtn, "У сериала нет бесплатной серии").toBeVisible();
    // Без force: перекрывающий кнопку оверлей - это баг, тест должен на нем падать
    await playFreeBtn.click();

    await skipPrerollIfPresent(page);

    // В плеере запущена именно серия сериала: "Черная икра: 1 серия, 1 сезон"
    await expect(page.locator(PLAYER_TITLE).first(), "В плеере запущена не серия сериала").toHaveText(/серия/);

    const video = playerVideo(page);
    await waitForVideoReady(video);
    await expectVideoIsPlaying(video);
    await seekToMiddle(page, video);
    await closePlayer(page);
  });
});
