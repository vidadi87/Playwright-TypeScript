import { Locator, Page, expect, test } from "@playwright/test";

/** Пункт «Язык интерфейса» на любом из языков интерфейса */
const LANGUAGE_ITEM_RE = /^(Язык интерфейса|Interface language|Интерфейс тілі)$/;

/**
 * Меню аккаунта (клик по аватару в шапке) у авторизованного пользователя:
 * другие профили, пункты настроек, «Выйти». Состав зависит от типа профиля (взрослый / детский).
 */
export class AccountMenu {
  readonly avatar: Locator;
  readonly logoutButton: Locator;
  readonly languageItem: Locator;
  /** Пункты настроек меню — есть у любого профиля и на любом языке */
  readonly items: Locator;
  /** «Буду смотреть» со счётчиком (только у взрослого профиля) */
  readonly favoritesItem: Locator;

  constructor(private readonly page: Page) {
    // Аватар авторизованного пользователя (до загрузки сессии в шапке значок гостя)
    this.avatar = page.locator('[class*="headerMenu_avatar_authorized"]').first();
    this.logoutButton = page.getByRole("button", { name: /^(Выйти|Log out|Шығу)$/ });
    this.items = page.locator('[class*="HeaderMenuItem_wrapper"]');
    this.languageItem = this.items.filter({ hasText: LANGUAGE_ITEM_RE }).first();
    this.favoritesItem = this.items.filter({ hasText: /^Буду смотреть/ }).first();
  }

  /** Клик до полной загрузки страницы меню не открывает — повторяем, пока не откроется */
  async open() {
    await expect(this.avatar, "В шапке нет аватара авторизованного пользователя").toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      if (!(await this.items.first().isVisible())) await this.avatar.click();
      await expect(this.items.first()).toBeVisible({ timeout: 2_000 });
    }, "Меню аккаунта не открылось").toPass({ timeout: 20_000 });
  }

  /** Профиль в списке меню (активный профиль в списке не показывается) */
  profile(name: string): Locator {
    return this.page
      .locator('[class*="ProfileItem_profileItem"]')
      .filter({ hasText: new RegExp(`^${name}$`) })
      .first();
  }

  /** Пункт меню по точному тексту («Подписка», «Аккаунт», «Управление профилями» …) */
  item(name: string): Locator {
    return this.page.getByText(name, { exact: true }).first();
  }

  /** src картинки аватара в шапке — по нему видно, какой профиль активен */
  async avatarKey(): Promise<string> {
    return avatarKey(await this.avatar.getAttribute("src"));
  }

  /**
   * Переключение профиля через меню. Выбор профиля — запрос POST /profile/select, действует только
   * в текущем контексте браузера. Готовность — аватар в шапке совпал с аватаром профиля в меню
   * (сравнивать с прежним аватаром нельзя: у двух профилей может быть одна картинка).
   */
  async switchTo(name: string) {
    await test.step(`Переключение на профиль «${name}»`, async () => {
      await this.open();
      const item = this.profile(name);
      const target = avatarKey(await item.locator("img").first().getAttribute("src"));
      const selected = this.page.waitForResponse(
        (r) => /\/profile\/select/.test(r.url()) && r.request().method() === "POST",
      );
      await item.click();
      expect((await selected).ok(), `Профиль «${name}» не выбран на сервере`).toBe(true);
      await expect.poll(() => this.avatarKey(), { message: `Профиль «${name}» не стал активным` }).toBe(target);
    });
  }
}

/** «…/avatars_kids-3?w=96…» → «avatars_kids-3»: одинаково для картинки в шапке и в окне выбора аватара */
export function avatarKey(src: string | null): string {
  return src?.match(/avatars_[a-z]+-\d+/)?.[0] ?? src ?? "";
}
