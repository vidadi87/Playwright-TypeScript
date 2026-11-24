import { Locator, Page, expect, test } from "@playwright/test";

const PLAYER_TIMEOUT = 15_000;
/* Максимум ожидания кнопки «Пропустить» (появляется после отсчёта ~5–8 сек) или окончания преролла */
const PREROLL_TIMEOUT = 30_000;
/* Основное видео считаем стартовавшим после этой отметки (сек): до показа преролла оно успевает
   проиграть ~0.2 сек и встаёт на паузу */
const MAIN_STARTED_SEC = 1;
/* Допустимая позиция после клика по середине полосы прогресса (доля длительности).
   Верхняя граница с запасом: видео продолжает идти, пока выполняется проверка */
const SEEK_MIDDLE_MIN = 0.4;
const SEEK_MIDDLE_MAX = 0.65;

/** «27:08» / «1:02:03» → секунды */
function parseTimecode(text: string): number {
  return text
    .trim()
    .split(":")
    .reduce((acc, part) => acc * 60 + Number(part), 0);
}

/**
 * Плеер сайта: один и тот же для трейлера и основного контента.
 *
 * Разметка:
 *   #startPlayerContainer
 *     video#startVideo          — основное видео
 *     figure#promoWrapper       — преролл (рекламный ролик), есть в DOM только пока показывается
 *       div «Пропустить»        — появляется после отсчёта
 * Классы — CSS-модули с хэшем (StartPlayerProgress_root__bar___FEuE), хэш меняется при пересборке
 * сайта, поэтому ищем по началу имени класса.
 */
export class Player {
  readonly container: Locator;
  readonly video: Locator;
  readonly title: Locator;
  readonly progressBar: Locator;
  readonly currentTime: Locator;
  readonly preroll: Locator;

  constructor(private readonly page: Page) {
    this.container = page.locator("#startPlayerContainer");
    // Не глобальный document.querySelector("video"): во время преролла в плеере есть ещё #promoVideo
    this.video = this.container.locator("#startVideo");
    this.title = page.locator('[class*="MainPlayer_title"]').first(); // «Черная икра: 1 серия, 1 сезон»
    this.progressBar = page.locator('[class*="StartPlayerProgress_root__bar"]');
    this.currentTime = page.locator('[class*="StartPlayerProgress_root__start"]'); // «27:08»
    this.preroll = page.locator("#promoWrapper");
  }

  /** Видео загружено: элемент виден, длительность известна */
  async waitForReady() {
    await test.step("Ожидание загрузки видео", async () => {
      await expect(this.video).toBeVisible({ timeout: PLAYER_TIMEOUT });
      await expect
        .poll(() => this.video.evaluate((v: HTMLVideoElement) => v.duration), {
          message: "Плеер не отдал валидную длительность",
          timeout: PLAYER_TIMEOUT,
        })
        .toBeGreaterThan(0); // NaN > 0 === false, поэтому poll ждёт реальное значение
    });
  }

  /** Видео реально воспроизводится: currentTime растёт */
  async expectPlaying(minAdvanceSec = 1) {
    const start = await this.video.evaluate((v: HTMLVideoElement) => v.currentTime);
    try {
      await expect
        .poll(() => this.video.evaluate((v: HTMLVideoElement) => v.currentTime), {
          message: "Видео не воспроизводится: currentTime не растёт",
          timeout: PLAYER_TIMEOUT,
        })
        .toBeGreaterThan(start + minAdvanceSec);
    } catch (e) {
      // Состояние плеера в момент падения: на паузе или застряло на буферизации
      const state = await this.video.evaluate((v: HTMLVideoElement) => ({
        currentTime: v.currentTime,
        paused: v.paused,
        ended: v.ended,
        readyState: v.readyState, // < 3 — не хватает данных для воспроизведения
        networkState: v.networkState,
        error: v.error ? v.error.code : null,
      }));
      throw new Error(`${(e as Error).message}\nСостояние video: ${JSON.stringify(state)}`, { cause: e });
    }
  }

  /**
   * Перемотка на середину кликом по полосе прогресса, как это делает пользователь.
   * Проверяем позицию видео, время в интерфейсе плеера и что воспроизведение продолжилось.
   */
  async seekToMiddle() {
    await test.step("Перемотка на середину кликом по полосе прогресса", async () => {
      const duration = await this.video.evaluate((v: HTMLVideoElement) => v.duration);
      expect(Number.isFinite(duration), "Длительность должна быть конечной (не live-поток)").toBe(true);

      // Контролы скрываются автоматически — показываем их наведением на плеер
      await this.container.hover();
      await expect(this.progressBar, "Полоса прогресса не отображается").toBeVisible();
      const box = await this.progressBar.boundingBox();
      expect(box, "Не удалось определить размеры полосы прогресса").not.toBeNull();
      await this.progressBar.click({ position: { x: box!.width / 2, y: box!.height / 2 } });

      const position = () => this.video.evaluate((v: HTMLVideoElement) => v.currentTime / v.duration);
      await expect
        .poll(position, {
          message: "Позиция воспроизведения не сместилась к середине после клика по полосе прогресса",
          timeout: 5_000,
        })
        .toBeGreaterThanOrEqual(SEEK_MIDDLE_MIN);
      expect(await position(), "Перемотка ушла дальше середины").toBeLessThanOrEqual(SEEK_MIDDLE_MAX);

      // Время в интерфейсе плеер обновляет не сразу (может показывать старое «00:02») — ждём
      const shownPosition = async () => {
        await this.container.hover(); // время видно только вместе с контролами
        return parseTimecode(await this.currentTime.innerText()) / duration;
      };
      await expect
        .poll(shownPosition, { message: "Время в плеере не сместилось к середине видео", timeout: 5_000 })
        .toBeGreaterThanOrEqual(SEEK_MIDDLE_MIN);
      expect(await shownPosition(), "Время в плеере ушло дальше середины").toBeLessThanOrEqual(SEEK_MIDDLE_MAX);

      await this.expectPlaying();
    });
  }

  /**
   * Пропуск преролла, если он есть. Преролл показывается не всегда, поэтому сначала ждём,
   * что стартует раньше: преролл или основное видео.
   */
  async skipPrerollIfPresent() {
    await test.step("Пропуск преролла (если есть)", async () => {
      let started: "preroll" | "main" | null = null;
      await expect
        .poll(
          async () => {
            if (await this.preroll.isVisible()) return (started = "preroll");
            // page.evaluate, а не locator.evaluate: тот ждёт появления элемента до actionTimeout
            const mainTime = await this.page.evaluate(
              () => document.querySelector<HTMLVideoElement>("#startVideo")?.currentTime ?? 0,
            );
            if (mainTime > MAIN_STARTED_SEC) return (started = "main");
            return null;
          },
          { message: "Не стартовал ни преролл, ни основное видео", timeout: PLAYER_TIMEOUT },
        )
        .not.toBeNull();

      if (started === "main") return;

      // Ждём «Пропустить» или окончания преролла (короткий ролик может закончиться сам).
      // exact: true — не кликнуть по тексту отсчёта вида «Пропустить через 5»
      const skip = this.preroll.getByText("Пропустить", { exact: true });
      await expect
        .poll(async () => (await skip.isVisible()) || !(await this.preroll.isVisible()), {
          message: "Кнопка «Пропустить» не появилась, преролл не закончился",
          timeout: PREROLL_TIMEOUT,
        })
        .toBe(true);

      if (await this.preroll.isVisible()) await skip.click();
      await expect(this.preroll, "Преролл не закрылся после «Пропустить»").toBeHidden({ timeout: 5_000 });
    });
  }

  /** Закрытие плеера крестиком с проверкой, что плеер исчез */
  async close() {
    await test.step("Закрытие плеера", async () => {
      await this.container.hover();
      const closeButton = this.page.getByRole("img", { name: "Close player" });
      await expect(closeButton).toBeVisible();
      await closeButton.click();
      await expect(this.container, "Плеер не закрылся").toBeHidden({ timeout: 5_000 });
    });
  }
}
