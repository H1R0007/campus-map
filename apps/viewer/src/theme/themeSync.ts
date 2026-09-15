import { useSettingsStore } from '../stores/settingsStore';
import { DARK_SCHEME_QUERY, applyColorScheme, resolveColorScheme } from './theme';

/**
 * Держит тему страницы в согласии с выбором человека и темой системы
 * (запись 34). Вызывается один раз, до отрисовки приложения.
 *
 * Тема ставится подписками, а не эффектом компонента: эффект срабатывал бы уже
 * после отрисовки, и слои карты на canvas успевали бы прочитать цвета прежней
 * темы.
 */
export function startThemeSync(): void {
  const system = window.matchMedia(DARK_SCHEME_QUERY);
  const apply = () => applyColorScheme(resolveColorScheme(useSettingsStore.getState().theme, system.matches));

  apply();
  system.addEventListener('change', apply);
  useSettingsStore.subscribe((state, previous) => {
    if (state.theme !== previous.theme) apply();
  });
}
