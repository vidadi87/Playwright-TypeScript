import { test, expect } from "../fixtures";
import { KIDS_MENU, PROFILES } from "../test-data/profiles";
import { AUTHORIZED_PRODUCTS } from "../test-data/products";
import { hasTestAccount } from "../utils/mailbox";

/**
 * [3] Авторизованный пользователь без подписки. Сессия — из tests/auth.setup.ts.
 * 3.1 (платный контент без подписки) пропускаем: продукт закрывается, оформление подписки отключено.
 * 3.4 (язык) и 3.5 (аватар) — в tests/3-account-changes.spec.ts: они меняют профиль на сервере и идут отдельно.
 * Профиль переключается только в своём контексте браузера, поэтому тесты не мешают друг другу.
 */
test.describe("[3] Авторизованный пользователь без подписки", () => {
  test.skip(!hasTestAccount(), "Нет TEST_EMAIL и GMAIL_APP_PASSWORD в .env (см. .env.example)");

  test.describe("[3.2] Воспроизведение трейлеров", () => {
    test("[3.2.1] Воспроизведение трейлера во взрослом профиле", async ({ product, player }) => {
      await product.open(AUTHORIZED_PRODUCTS.adultTrailer.url, { authorized: true });
      await product.trailerButton.click();
      await player.waitForReady();
      await player.expectPlaying();
      await player.seekToMiddle();
      await player.close();
    });

    test("[3.2.2] Воспроизведение трейлера в детском профиле", async ({ page, accountMenu, product, player }) => {
      await page.goto("/ru", { waitUntil: "domcontentloaded" });
      await accountMenu.switchTo(PROFILES.kids);

      await product.open(AUTHORIZED_PRODUCTS.kidsTrailer.url, { authorized: true });
      await product.trailerButton.click();
      await player.waitForReady();
      await player.expectPlaying();
      await player.seekToMiddle();
      await player.close();
    });
  });

  test.describe("[3.3] Переключение профилей через меню аккаунта", () => {
    test("[3.3.1.1] Переключение со взрослого профиля на детский", async ({ page, header, accountMenu }) => {
      await page.goto("/ru", { waitUntil: "domcontentloaded" });
      const adultAvatar = await accountMenu.avatarKey();

      await accountMenu.switchTo(PROFILES.kids);

      await expect(page, "Не открылась детская главная").toHaveURL(/\/kids/);
      await expect(page.locator('[id^="slider_"]').first(), "На детской главной нет линеек").toBeAttached();
      for (const name of KIDS_MENU) {
        await expect(header.menuLink(name), `В детском меню нет «${name}»`).toBeVisible();
      }
      for (const name of ["Фильмы", "Сериалы", "ТВ"]) {
        await expect(header.menuLink(name), `В детском меню не должно быть «${name}»`).toHaveCount(0);
      }
      expect(await accountMenu.avatarKey(), "В шапке остался аватар взрослого профиля").not.toBe(adultAvatar);
    });

    test("[3.3.2.1] Переключение с детского профиля на взрослый", async ({ page, header, accountMenu }) => {
      await page.goto("/ru", { waitUntil: "domcontentloaded" });
      const adultAvatar = await accountMenu.avatarKey();
      await accountMenu.switchTo(PROFILES.kids);

      await accountMenu.switchTo(PROFILES.main);

      await expect(page, "Осталась детская главная").not.toHaveURL(/\/kids/);
      for (const name of ["Фильмы", "Сериалы", "Детям", "ТВ", "Кино на ТВ", "Спорт", "Новинки", "Буду смотреть"]) {
        await expect(header.menuLink(name).first(), `В меню нет «${name}»`).toBeVisible();
      }
      expect(await accountMenu.avatarKey(), "В шапке не аватар основного профиля").toBe(adultAvatar);
    });
  });
});
