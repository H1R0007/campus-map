/**
 * Библиотека значков Tabler Icons для окна «Все виды» редактора.
 *
 * Пакет `@tabler/icons` отдаёт наружу только отдельные SVG-файлы, а редактору
 * нужна вся библиотека с метками для поиска. Плагин собирает её из файлов
 * пакета в виртуальный модуль `virtual:tabler-icons`: редактор загружает его
 * только когда открывают выбор значка, а в навигатор библиотека не попадает
 * вовсе — туда едет картинка выбранного значка в данных (запись 44).
 *
 * Логотипы брендов не берутся: значку места они не подходят, а чужие товарные
 * знаки на карте вуза ни к чему.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ID = 'virtual:tabler-icons';
const RESOLVED = `\0${ID}`;

/**
 * @param {{ packageDir: string }} options каталог пакета `@tabler/icons`
 */
export function tablerIconsPlugin({ packageDir }) {
  return {
    name: 'campus-tabler-icons',

    resolveId(id) {
      return id === ID ? RESOLVED : null;
    },

    load(id) {
      if (id !== RESOLVED) return null;

      const nodes = JSON.parse(readFileSync(path.join(packageDir, 'tabler-nodes-outline.json'), 'utf8'));
      const meta = JSON.parse(readFileSync(path.join(packageDir, 'icons.json'), 'utf8'));

      // [имя, категория, метки через пробел, узлы значка]
      const icons = [];
      for (const [name, parts] of Object.entries(nodes)) {
        const info = meta[name];
        if (!info || info.category === 'Brand') continue;
        icons.push([name, info.category ?? '', (info.tags ?? []).join(' '), parts]);
      }
      icons.sort((a, b) => a[0].localeCompare(b[0]));

      return `export default ${JSON.stringify(icons)};`;
    },
  };
}
