/**
 * Уход со страницы по решению самого редактора — в учебную копию и обратно
 * (запись 55).
 *
 * Браузер спрашивает «Покинуть сайт?», пока есть несохранённые правки. Здесь
 * вопрос лишний: редактор перед уходом сам записал черновик, и правки
 * вернутся, когда человек вернётся к этим данным.
 */

let leaving = false;

/** Редактор уходит сам — предупреждение браузера не нужно. */
export function isLeavingOnPurpose(): boolean {
  return leaving;
}

export function leavePage(href: string): void {
  leaving = true;
  globalThis.location.assign(href);
}

export function reloadPage(): void {
  leaving = true;
  globalThis.location.reload();
}
