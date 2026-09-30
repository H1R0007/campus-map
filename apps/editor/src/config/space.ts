import { DATA_ROOT } from '@campus-map/core';

/**
 * С какими данными работает редактор: с настоящими или с учебной копией
 * (запись 55).
 *
 * Выбор — в адресе страницы (`?space=sandbox`), а не в памяти: переход между
 * данными — это новая загрузка страницы, и правки одних данных не могут
 * оказаться в других. Копию раздаёт тот же dev-сервер по своим адресам
 * (`tooling/vite-plugin-campus-data.mjs`), настоящий `data/` через них
 * недостижим.
 */
export type DataSpace = 'main' | 'sandbox';

const BASE = import.meta.env.BASE_URL;

function readSpace(): DataSpace {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('space') === 'sandbox' ? 'sandbox' : 'main';
  } catch {
    return 'main';
  }
}

export const SPACE: DataSpace = readSpace();

/** Служебные адреса учебной копии: состояние, сброс, её данные. */
export const SANDBOX_CONTROL_URL = `${BASE}__campus/sandbox`;

/** Служебные адреса данных, с которыми открыт редактор: манифест, сохранение. */
export const CONTROL_URL = SPACE === 'sandbox' ? SANDBOX_CONTROL_URL : `${BASE}__campus`;

/** Откуда читаются файлы данных. */
export const SPACE_DATA_URL = SPACE === 'sandbox' ? `${SANDBOX_CONTROL_URL}/${DATA_ROOT}` : `${BASE}${DATA_ROOT}`;

/** Адрес этой же страницы с другими данными. */
export function spaceHref(space: DataSpace): string {
  const url = new URL(globalThis.location.href);
  if (space === 'sandbox') url.searchParams.set('space', 'sandbox');
  else url.searchParams.delete('space');
  return url.toString();
}
