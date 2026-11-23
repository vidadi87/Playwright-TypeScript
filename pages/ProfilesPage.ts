import { Locator, Page, expect, test } from "@playwright/test";
import { avatarKey } from "../components/AccountMenu";

export const PROFILES_URL_RE = /\/whos-watching/;

/**
 * «Управление профилями» (окно …/whos-watching) и окно «Редактирование профиля».
 * В тестах меняем только аватар: название, тип профиля и «Удалить профиль» не трогаем.
 */
export class ProfilesPage {
  readonly title: Locator;
  readonly addProfileButton: Locator;
  /** «Готово» не закрывает окно, а переводит его в режим «Выберите профиль» (как и «Сохранить») */
  readonly doneButton: Locator;
  readonly editTitle: Locator;
  /** Режим окна после «Готово» или «Сохранить» */
  readonly chooseTitle: Locator;
  readonly avatarButtons: Locator;
  readonly saveButton: Locator;

  constructor(private readonly page: Page) {
    this.title = page.getByRole("heading", { name: "Управление профилями" });
    this.addProfileButton = page.getByRole("button", { name: "Добавить профиль" });
    this.doneButton = page.getByRole("button", { name: "Готово", exact: true });
    this.editTitle = page.getByRole("heading", { name: "Редактирование профиля" });
    this.chooseTitle = page.getByRole("heading", { name: "Выберите профиль" });
    this.avatarButtons = page.locator('[class*="AddEditProfileModal_avatarButton"]');
    this.saveButton = page.getByRole("button", { name: "Сохранить", exact: true });
  }

  profile(name: string): Locator {
    return this.page.locator('[class*="ProfileItem_profileItem"]').filter({ hasText: new RegExp(`^${name}$`) }).first();
  }

  async expectOpened() {
    await expect(this.page).toHaveURL(PROFILES_URL_RE);
    await expect(this.title, "Не открылось окно «Управление профилями»").toBeVisible();
  }

  /** Открыть «Редактирование профиля» и вернуть аватар, выбранный сейчас */
  async editProfile(name: string): Promise<string> {
    await this.profile(name).click();
    await expect(this.editTitle, `Не открылось редактирование профиля «${name}»`).toBeVisible();
    const active = this.avatarButtons.filter({ has: this.page.locator('[class*="Avatar_active"]') }).first();
    return avatarKey(await active.locator("img").getAttribute("src"));
  }

  /** Выбрать аватар по ключу (avatars_kids-3) или первый, отличный от текущего; вернуть ключ выбранного */
  async chooseAvatar(target: { key?: string; differentFrom?: string }): Promise<string> {
    const count = await this.avatarButtons.count();
    for (let i = 0; i < count; i++) {
      const key = avatarKey(await this.avatarButtons.nth(i).locator("img").getAttribute("src"));
      if ((target.key && key === target.key) || (target.differentFrom && key !== target.differentFrom)) {
        await this.avatarButtons.nth(i).click();
        return key;
      }
    }
    throw new Error(`Подходящий аватар не найден: ${JSON.stringify(target)}`);
  }

  /** Картинка профиля в списке окна (ключ вида avatars_kids-3) */
  async profileAvatarKey(name: string): Promise<string> {
    return avatarKey(await this.profile(name).locator("img").first().getAttribute("src"));
  }

  /** «Сохранить» закрывает редактирование и переводит окно в режим «Выберите профиль» со списком профилей */
  async save() {
    await this.saveButton.click();
    await expect(this.editTitle, "Окно редактирования не закрылось после «Сохранить»").toBeHidden();
  }

  /** В режиме выбора профиля «Готово» нет — окно закрывается крестиком (активный профиль при этом не меняется) */
  async close() {
    await expect(async () => {
      await this.page.getByRole("button", { name: "Close modal" }).first().click();
      await expect(this.page).not.toHaveURL(PROFILES_URL_RE, { timeout: 3_000 });
    }, "Окно профилей не закрылось").toPass({ timeout: 20_000 });
  }

  /**
   * Сменить аватар профиля: «Управление профилями» → профиль → аватар → «Сохранить» → проверка картинки
   * в списке профилей → закрыть окно. Возвращает { было, стало }.
   * Аватар в шапке после сохранения не обновляется до перезагрузки страницы (дефект сайта).
   */
  async changeAvatar(open: () => Promise<void>, profileName: string, target: { key?: string }) {
    return test.step(`Смена аватара профиля «${profileName}»`, async () => {
      await open();
      await this.expectOpened();
      const before = await this.editProfile(profileName);
      const chosen = await this.chooseAvatar(target.key ? target : { differentFrom: before });
      await this.save();
      await expect
        .poll(() => this.profileAvatarKey(profileName), { message: `В списке профилей у «${profileName}» не новая картинка` })
        .toBe(chosen);
      await this.close();
      return { before, chosen };
    });
  }
}
