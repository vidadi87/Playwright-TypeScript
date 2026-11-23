import { test, expect } from "../fixtures";
import type { AccountMenu } from "../components/AccountMenu";
import type { LanguageCode, LanguagePopup } from "../components/LanguagePopup";
import type { ProfileApi } from "../utils/profileApi";
import { PROFILES } from "../test-data/profiles";
import { hasTestAccount } from "../utils/mailbox";

/**
 * [3.4] Язык интерфейса и [3.5] аватар профиля. Оба меняются в профиле на сервере, поэтому:
 * - файл идёт отдельным проектом после остальных тестов авторизованного пользователя (playwright.config.ts);
 * - тесты внутри файла идут по очереди;
 * - каждый тест в конце возвращает исходное состояние.
 */
test.describe.configure({ mode: "default" });

/**
 * Окно «Язык интерфейса» предвыбирает язык адреса, а не профиля: если они разошлись, выбор «того же»
 * языка ничего не сохраняет. Поэтому сначала открываем главную на сохранённом языке профиля.
 */
async function setProfileLanguage(profileApi: ProfileApi, languagePopup: LanguagePopup, code: LanguageCode) {
  await profileApi.openHomeInProfileLanguage();
  await languagePopup.setLanguage(code);
}

/** «Управление профилями» есть только в меню взрослого профиля */
function profilesOpener(accountMenu: AccountMenu) {
  return async () => {
    await accountMenu.open();
    await accountMenu.item("Управление профилями").click();
  };
}

test.describe("[3] Авторизованный пользователь: изменения профиля", () => {
  test.skip(!hasTestAccount(), "Нет TEST_EMAIL и GMAIL_APP_PASSWORD в .env (см. .env.example)");

  /**
   * Сохранённый язык каждого профиля проверяем по данным сервера (profileApi), видимый результат —
   * по интерфейсу: адрес /en и пункты меню не на русском.
   */
  test.describe("[3.4] Смена языка интерфейса", () => {
    test("[3.4.1.1] Смена языка во взрослом профиле", async ({ header, accountMenu, languagePopup, profileApi }) => {
      await profileApi.openHomeInProfileLanguage();
      await profileApi.expectInterfaceLanguage(PROFILES.main, "ru", "Перед тестом основной профиль не на русском");
      await profileApi.expectInterfaceLanguage(PROFILES.kids, "ru", "Перед тестом детский профиль не на русском");

      await setProfileLanguage(profileApi, languagePopup, "ENG");
      try {
        await expect(header.menuLink("Movies"), "Меню не на английском").toBeVisible();
        await expect(header.menuLink("Фильмы"), "В меню остались пункты на русском").toHaveCount(0);
        await profileApi.expectInterfaceLanguage(PROFILES.main, "en", "Язык основного профиля не сохранился");

        await accountMenu.switchTo(PROFILES.kids);
        await profileApi.expectInterfaceLanguage(PROFILES.kids, "ru", "Язык детского профиля изменился вместе с основным");
        await profileApi.openHomeInProfileLanguage();
        await expect(header.menuLink("Мультфильмы"), "Детское меню не на русском").toBeVisible();
      } finally {
        await test.step("Возврат состояния: основной профиль, язык РУС", async () => {
          if ((await profileApi.current()).child) {
            await profileApi.openHomeInProfileLanguage();
            await accountMenu.switchTo(PROFILES.main);
          }
          await setProfileLanguage(profileApi, languagePopup, "РУС");
          await profileApi.expectInterfaceLanguage(PROFILES.main, "ru", "Язык основного профиля не вернулся на русский");
        });
      }
    });

    test("[3.4.2.1] Смена языка в детском профиле", async ({ header, accountMenu, languagePopup, profileApi }) => {
      await profileApi.openHomeInProfileLanguage();
      await profileApi.expectInterfaceLanguage(PROFILES.main, "ru", "Перед тестом основной профиль не на русском");
      await profileApi.expectInterfaceLanguage(PROFILES.kids, "ru", "Перед тестом детский профиль не на русском");
      await accountMenu.switchTo(PROFILES.kids);

      await setProfileLanguage(profileApi, languagePopup, "ENG");
      try {
        await profileApi.expectInterfaceLanguage(PROFILES.kids, "en", "Язык детского профиля не сохранился");
        await profileApi.openHomeInProfileLanguage();
        await expect(header.menuLink("Мультфильмы"), "В детском меню остались пункты на русском").toHaveCount(0);

        await accountMenu.switchTo(PROFILES.main);
        await profileApi.expectInterfaceLanguage(PROFILES.main, "ru", "Язык основного профиля изменился вместе с детским");
        await profileApi.openHomeInProfileLanguage();
        await expect(header.menuLink("Фильмы"), "Меню основного профиля не на русском").toBeVisible();
      } finally {
        await test.step("Возврат состояния: детский профиль — РУС, затем основной профиль", async () => {
          if (!(await profileApi.current()).child) {
            await profileApi.openHomeInProfileLanguage();
            await accountMenu.switchTo(PROFILES.kids);
          }
          await setProfileLanguage(profileApi, languagePopup, "РУС");
          await profileApi.expectInterfaceLanguage(PROFILES.kids, "ru", "Язык детского профиля не вернулся на русский");
          await profileApi.openHomeInProfileLanguage();
          await accountMenu.switchTo(PROFILES.main);
        });
      }
    });
  });

  /** Аватар детского профиля меняется из основного: в меню детского профиля нет «Управления профилями» */
  test.describe("[3.5] Изменение аватарки", () => {
    test("[3.5.1] Изменение аватарки во взрослом профиле", async ({ page, accountMenu, profiles, profileApi }) => {
      await profileApi.openHomeInProfileLanguage();
      const openProfiles = profilesOpener(accountMenu);

      const { before, chosen } = await profiles.changeAvatar(openProfiles, PROFILES.main, {});
      try {
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect
          .poll(() => accountMenu.avatarKey(), { message: "После перезагрузки в шапке не новый аватар" })
          .toBe(chosen);
      } finally {
        await test.step("Возврат исходного аватара", async () => {
          await profiles.changeAvatar(openProfiles, PROFILES.main, { key: before });
        });
      }
    });

    test("[3.5.2] Изменение аватарки в детском профиле", async ({ page, accountMenu, profiles, profileApi }) => {
      await profileApi.openHomeInProfileLanguage();
      const openProfiles = profilesOpener(accountMenu);

      const { before, chosen } = await profiles.changeAvatar(openProfiles, PROFILES.kids, {});
      try {
        await accountMenu.switchTo(PROFILES.kids);
        expect(await accountMenu.avatarKey(), "В шапке детского профиля не новый аватар").toBe(chosen);
      } finally {
        await test.step("Возврат исходного аватара", async () => {
          await profileApi.openHomeInProfileLanguage();
          if ((await profileApi.current()).child) await accountMenu.switchTo(PROFILES.main);
          await profiles.changeAvatar(openProfiles, PROFILES.kids, { key: before });
        });
      }
    });
  });
});
