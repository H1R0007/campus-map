import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { DATA_ROOT } from '@campus-map/core';
import type { Dataset } from '@campus-map/core';
import { datasetFiles } from './datasetFiles';

/**
 * Архив с данными — запасной путь сохранения.
 *
 * Основной путь — запись прямо в `data/` при запуске из репозитория
 * (`saveToDisk`). Архив нужен там, где такой возможности нет: редактор,
 * развёрнутый на сервере, отдаёт разметку файлом, который разработчик кладёт
 * в репозиторий.
 *
 * Содержимое файлов собирает `datasetFiles` — то же самое, что пишется на
 * диск: два способа сохранения не должны расходиться.
 */

const ZIP_README = `# Данные карты кампуса

Выгружено: {timestamp}

## Как применить

Содержимое каталога \`data/\` из архива кладётся в корень монорепозитория,
рядом с \`apps/\` и \`packages/\` — с заменой файлов. Оба приложения
подхватывают его автоматически: плагин \`tooling/vite-plugin-campus-data.mjs\`
раздаёт один и тот же каталог и в режиме разработки, и в прод-сборке.
Копировать данные внутрь \`apps/viewer\` или \`apps/editor\` не нужно.

В архиве только изменённые планы этажей и территории (\`map.png\`, \`map.svg\`,
\`map.jpg\`, \`map.webp\`): новые, заменённые и переехавшие на другой номер
этажа. Остальные планы в каталоге данных остаются прежними.
{sources}{deleted}
## Что внутри

\`\`\`
data/
├── campus/meta.json         список корпусов, размер и масштаб территории
├── campus/graph.json        узлы территории
├── buildings/<id>/meta.json имя корпуса, этажи, привязка к метрике
├── buildings/<id>/floors/<этаж>/graph.json  узлы этажа
├── transitions.json         переходы между планами
└── aliases.json             названия помещений, переводы и категории
\`\`\`

\`building\` и \`floor\` у узлов не записываются: их определяет путь файла.
Поле \`comment\` — рабочая заметка разметчика, студентам она не показывается.
`;

/** Что, кроме файлов JSON, уходит в архив (запись 47). */
export interface ArchiveExtras {
  /** Изменённые планы: путь внутри `data/` → содержимое. */
  plans: { path: string; blob: Blob }[];
  /** Новые исходники планов для `data-sources/`. */
  sources: { name: string; blob: Blob }[];
  /** Файлы данных, которые больше не нужны. */
  deleted: string[];
}

const NO_EXTRAS: ArchiveExtras = { plans: [], sources: [], deleted: [] };

/**
 * Собирает датасет в ZIP-архив и отдаёт его на скачивание.
 */
export async function exportToZip(dataset: Dataset, extras: ArchiveExtras = NO_EXTRAS): Promise<void> {
  const zip = new JSZip();
  const dataFolder = zip.folder(DATA_ROOT);
  if (!dataFolder) {
    throw new Error(`Не удалось создать каталог ${DATA_ROOT} в архиве`);
  }

  for (const [relativePath, content] of datasetFiles(dataset)) {
    dataFolder.file(relativePath, content);
  }
  for (const plan of extras.plans) dataFolder.file(plan.path, plan.blob);
  for (const source of extras.sources) zip.file(`data-sources/${source.name}`, source.blob);

  const sourcesNote =
    extras.sources.length === 0
      ? ''
      : '\nПрисланные оригиналы планов лежат в `data-sources/` — рядом с `data/`. В git они\nне попадают (запись 46): это нужно редактору, чтобы изменить обрезку плана.\n';
  const deletedNote =
    extras.deleted.length === 0
      ? ''
      : `\n**Удалите из \`data/\`** — этих этажей, корпусов или форматов плана больше нет:\n\n${extras.deleted.map((path) => `- \`${path}\``).join('\n')}\n`;

  zip.file(
    'README.md',
    ZIP_README.replace('{timestamp}', new Date().toISOString()).replace('{sources}', sourcesNote).replace('{deleted}', deletedNote)
  );

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `campus-map-data-${new Date().toISOString().slice(0, 10)}.zip`);
}
