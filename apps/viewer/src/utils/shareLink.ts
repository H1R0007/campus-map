/**
 * Чем кончилась попытка поделиться ссылкой:
 * - `shared` — ссылку передало системное окно «Поделиться»;
 * - `cancelled` — человек закрыл это окно;
 * - `copied` — ссылка в буфере обмена;
 * - `manual` — недоступно ни то ни другое, ссылку нужно показать, чтобы её
 *   скопировали вручную.
 */
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'manual';

/**
 * Возможности браузера, которые нужны «Поделиться». Приходят параметром: так
 * правило выбора проверяется тестом без DOM.
 */
export interface ShareEnvironment {
  share?: (data: { url: string; title: string }) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}

/**
 * Возможности текущего браузера.
 *
 * Типы DOM обещают `navigator.share` и `navigator.clipboard` всегда, а на деле
 * оба доступны только в безопасном контексте: на сайте по HTTP их нет, как и
 * системного окна «Поделиться» в большинстве настольных браузеров.
 */
export function browserShareEnvironment(): ShareEnvironment {
  return {
    share: 'share' in navigator ? (data) => navigator.share(data) : undefined,
    writeText: 'clipboard' in navigator ? (text) => navigator.clipboard.writeText(text) : undefined,
  };
}

/**
 * Делится ссылкой лучшим доступным способом: системным окном, иначе
 * копированием в буфер обмена.
 *
 * Результат говорит, что показать человеку. Раньше неудача копирования
 * глушилась, и на сайте по HTTP нажатие «Поделиться» не давало ничего видимого.
 */
export async function shareLink(url: string, title: string, env: ShareEnvironment): Promise<ShareOutcome> {
  if (env.share) {
    try {
      await env.share({ url, title });
      return 'shared';
    } catch (error) {
      // Закрытое окно — решение человека, а не повод копировать без спроса.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Любой другой отказ (запрет в контексте страницы) — пробуем буфер обмена.
    }
  }

  if (env.writeText) {
    try {
      await env.writeText(url);
      return 'copied';
    } catch {
      // Браузер отказал в записи (запрет, вкладка без фокуса) — остаётся ручное
      // копирование, его и предложит результат.
    }
  }

  return 'manual';
}
