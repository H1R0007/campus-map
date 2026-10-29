#!/usr/bin/env node
/**
 * Карта документации на главной странице.
 *
 * Документацию читают двумя способами: на GitHub и на собранном сайте. Сайт
 * строит навигацию сам, обходя каталоги, а на GitHub навигации нет — виден
 * только список файлов. Поэтому в `docs/index.md` лежит таблица всех страниц с
 * описаниями; без неё читателю на GitHub приходится открывать файлы наугад.
 *
 * Таблица собирается из тех же файлов и в том же порядке, что и боковая
 * навигация сайта, поэтому расходиться им негде — но только если таблицу
 * пересобрали. Отсюда два режима:
 *
 * - без ключей — переписать блок в `docs/index.md`;
 * - `--check` — ничего не менять, а упасть, если блок устарел. Этот режим
 *   запускает сборка документации, так что забытая строка видна в CI, а не
 *   через месяц на GitHub.
 *
 * Использование:
 *   pnpm docs:map            # обновить карту после добавления страницы
 *   pnpm docs:map --check    # проверить (то же делает pnpm docs:build)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsPages } from '../docs/.vitepress/sidebar.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Файлы с картой.
 *
 * `docs/index.md` — главная страница сайта. `docs/README.md` — то, что GitHub
 * показывает при открытии каталога: без него читатель видит только список
 * файлов. Текст карты один и тот же, поэтому оба файла собираются этой
 * командой, и разойтись им негде.
 */
const TARGETS = ['index.md', 'README.md'].map((name) => path.join(REPO_ROOT, 'docs', name));

/** Маркеры блока: всё между ними — сгенерированное, руками не правится. */
const START = '<!-- карта:начало -->';
const END = '<!-- карта:конец -->';

/** Страница из `/data/node` в ссылку `data/node.md`. */
function linkOf(route) {
  return `${route.replace(/^\//, '')}.md`;
}

/** Таблица разделов: раздел, страницы с описаниями. */
function renderMap() {
  const pages = docsPages();
  const sections = [];

  for (const page of pages) {
    const last = sections.at(-1);
    if (last && last.text === page.section) last.pages.push(page);
    else sections.push({ text: page.section, pages: [page] });
  }

  const blocks = sections.map((section) => {
    const rows = section.pages
      .map((page) => `| [${page.text}](${linkOf(page.link)}) | ${page.description} |`)
      .join('\n');

    return `### ${section.text}\n\n| Страница | О чём |\n| --- | --- |\n${rows}`;
  });

  return `${START}\n\n${blocks.join('\n\n')}\n\n${END}`;
}

function main() {
  const check = process.argv.includes('--check');
  const next = renderMap();
  const stale = [];

  for (const file of TARGETS) {
    const source = readFileSync(file, 'utf8');
    const start = source.indexOf(START);
    const end = source.indexOf(END);

    if (start === -1 || end === -1) {
      throw new Error(`в ${path.relative(REPO_ROOT, file)} нет маркеров ${START} … ${END}`);
    }

    if (source.slice(start, end + END.length) === next) continue;
    stale.push(file);

    if (!check) {
      writeFileSync(file, source.slice(0, start) + next + source.slice(end + END.length), 'utf8');
    }
  }

  if (stale.length === 0) {
    if (!check) process.stdout.write('Карта документации уже актуальна\n');
    return;
  }

  if (check) {
    const names = stale.map((file) => path.relative(REPO_ROOT, file)).join(', ');
    process.stderr.write(`Карта документации устарела: ${names}. Запустите pnpm docs:map\n`);
    process.exit(1);
  }

  for (const file of stale) {
    process.stdout.write(`Карта документации обновлена: ${path.relative(REPO_ROOT, file)}\n`);
  }
}

main();
