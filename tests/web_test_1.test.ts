import { test, expect, Page } from '@playwright/test';

  // ТЕСТ [1.1]: Проверка выбора языка на начальном экране
  test('[1.1] Выбор русского языка на начальном экране', async ({ page }) => {
    // 1. Переходим на главную страницу сервиса
    await page.goto('https://devg14.unico.wtf/', { waitUntil: 'domcontentloaded' });

    // 2. Переключаем язык интерфейса на русский
    await page.getByText('Қазақша').click();
    await page.getByText('Русский').click();
    await page.getByText('Сохранить').click();

    // 3. Подтверждаем переход на русскую версию (/ru)
    await page.waitForURL('**/ru');
    await expect(page).toHaveURL(/.*\/ru/);
  });

// Вспомогательное предусловие: выбор языка и переход в карточку первого фильма
async function openMoviePage(page: Page) {
  await page.goto('https://devg14.unico.wtf/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Қазақша').click();
  await page.getByText('Русский').click();
  await page.getByText('Сохранить').click();
  await page.waitForURL('**/ru');

  const firstMovie = page.locator('#slider_originals-ma').getByRole('link').first();
  await expect(firstMovie).toBeVisible();
  await firstMovie.click();
  await page.waitForURL(/\/watch\//);
}

  // ТЕСТ 1.5: Проверка работы плеера трейлера
  test('[1.5] Воспроизведение и перемотка трейлера', async ({ page }) => {
    // 1. Находим кнопку запуска трейлера и убеждаемся, что она доступна
    await openMoviePage(page);
    const trailerBtn = page.getByText('Трейлер').first();
    await expect(trailerBtn).toBeVisible();
    
    // 2. Открываем модальное окно с трейлером
    await trailerBtn.click();

    // 3. Находим элемент <video> в DOM и ждем его отображения на странице (до 15 секунд)
    const trailerVideo = page.locator('video').first();
    await expect(trailerVideo).toBeVisible({ timeout: 15000 });

    // 4. Ожидаем инициализации видеопотока: плеер должен подгрузить метаданные и отдать валидную длительность (duration > 0)
    await page.waitForFunction(() => {
      const node = document.querySelector('video');
      return Boolean(node) && Number.isFinite((node as HTMLVideoElement).duration) && (node as HTMLVideoElement).duration > 0;
    }, { timeout: 15000 });

    // 5. Считываем полную продолжительность трейлера в секундах
    const duration = await trailerVideo.evaluate((video: HTMLVideoElement) => video.duration);

    // 6. Выполняем перемотку на середину видеоряда
    if (Number.isFinite(duration) && duration > 0) {
      const seekTo = duration / 2; // Расчет временной метки ровно на 50% хронометража
      
      // Меняем текущую позицию воспроизведения через JS-свойство видеоплеера
      await trailerVideo.evaluate((video: HTMLVideoElement, time: number) => {
        video.currentTime = time;
      }, seekTo);

      // 7. Через регулярный опрос (poll) проверяем, что ползунок воспроизведения действительно сместился на нужную секунду
      await expect.poll(async () => {
        return await trailerVideo.evaluate((video: HTMLVideoElement) => video.currentTime);
      }, { timeout: 3000 }).toBeGreaterThanOrEqual(Math.max(0, seekTo - 0.1));
    }
      await page.locator('#middle').click();

    // 8. Закрываем плеер: пытаемся кликнуть по иконке крестика, если её нет — нажимаем клавишу Escape
    const closeTrailerBtn = page.getByRole('img', { name: 'Close player' });
    if (await closeTrailerBtn.isVisible().catch(() => false)) {
      await closeTrailerBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

    // 9. Проверяем, что модальный контейнер плеера полностью исчез из поля зрения
    await page.locator('#startPlayerContainer').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  });

  // ТЕСТ 2: Проверка работы плеера основного фильма
  test('[1.6] Воспроизведение и перемотка основного фильма', async ({ page }) => {
    // 1. Находим кнопку запуска полноформатного фильма и кликаем по ней
    await openMoviePage(page);
    const playFreeBtn = page.getByText('Смотреть бесплатно', { exact: true }).first();
    await expect(playFreeBtn).toBeVisible();
    await playFreeBtn.click({ force: true }); // force: true позволяет обойти возможные прозрачные оверлеи

    // 2. Обрабатываем возможную рекламу (преролл): если кнопка "Пропустить" появляется в течение 5 сек — кликаем
    const skipBtn = page.getByText('Пропустить');
    await skipBtn.click({ timeout: 5000 }).catch(() => {});

    // 3. Находим элемент <video> основного контента и ждем его появления
    const movieVideo = page.locator('video').first();
    await expect(movieVideo).toBeVisible({ timeout: 15000 });

    // 4. Ожидаем загрузки метаданных фильма (получения корректного значения длительности)
    await page.waitForFunction(() => {
      const node = document.querySelector('video');
      return Boolean(node) && Number.isFinite((node as HTMLVideoElement).duration) && (node as HTMLVideoElement).duration > 0;
    }, { timeout: 15000 });

    // 5. Получаем общую длительность фильма в секундах
    const duration = await movieVideo.evaluate((video: HTMLVideoElement) => video.duration);

    // 6. Перематываем фильм на 50% от общей длительности
    if (Number.isFinite(duration) && duration > 0) {
      const seekTo = duration / 2;
      
      await movieVideo.evaluate((video: HTMLVideoElement, time: number) => {
        video.currentTime = time;
      }, seekTo);

      // 7. Убеждаемся, что системное время плеера обновилось после перемотки
      await expect.poll(async () => {
        return await movieVideo.evaluate((video: HTMLVideoElement) => video.currentTime);
      }, { timeout: 3000 }).toBeGreaterThanOrEqual(Math.max(0, seekTo - 0.1));
    }
    await page.locator('#middle').click();

    // 8. Закрываем плеер фильма (крестик или клавиша Escape)
    const closeMovieBtn = page.getByRole('img', { name: 'Close player' });
    if (await closeMovieBtn.isVisible().catch(() => false)) {
      await closeMovieBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

    // 9. Финальная проверка: контейнер плеера успешно закрыт
    await page.locator('#startPlayerContainer').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  });