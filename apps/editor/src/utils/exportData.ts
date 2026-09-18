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

Планы этажей (\`map.png\`, \`map.svg\`) в архив не попадают: редактор их не
меняет, и в каталоге данных они остаются прежними.

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

/**
 * Собирает датасет в ZIP-архив и отдаёт его на скачивание.
 */
export async function exportToZip(dataset: Dataset): Promise<void> {
  const zip = new JSZip();
  const dataFolder = zip.folder(DATA_ROOT);
  if (!dataFolder) {
    throw new Error(`Не удалось создать каталог ${DATA_ROOT} в архиве`);
  }

  for (const [relativePath, content] of datasetFiles(dataset)) {
    dataFolder.file(relativePath, content);
  }

  zip.file('README.md', ZIP_README.replace('{timestamp}', new Date().toISOString()));

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `campus-map-data-${new Date().toISOString().slice(0, 10)}.zip`);
}
