import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Боковая навигация собирается из файлов.
 *
 * Правило «одна тема — один файл» держится только тогда, когда новая страница
 * не требует правки конфига: иначе через месяц никто не захочет добавлять
 * главу, потому что «надо ещё где-то прописать». Поэтому здесь нет списка
 * страниц — есть обход каталога:
 *
 * - раздел — каталог верхнего уровня в `docs/`, кроме служебных и архивных;
 * - страница — файл `.md` внутри раздела, кроме `index.md`;
 * - порядок — поле `order` во фронтматтере (по возрастанию), затем заголовок;
 * - название пункта — первый заголовок `# …` в файле.
 *
 * Добавить главу — создать файл. Добавить раздел — создать каталог и строку в
 * `SECTIONS` (порядок разделов задаётся здесь и только здесь).
 *
 * Файл намеренно на чистом JavaScript: конфиг VitePress собирается esbuild,
 * и импорт соседнего TypeScript-модуля без расширения он не разрешает. Двух
 * полей фронтматтера хватает регулярного выражения — зависимость ради них
 * не нужна.
 */

const DOCS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Разделы в том порядке, в каком их читают.
 *
 * Ключ — имя каталога, значение — подпись в навигации. Каталог, которого нет
 * в этом списке, в боковую навигацию не попадает: так архивные и служебные
 * материалы остаются доступными по ссылке, но не выглядят частью справочника.
 *
 * @type {{ dir: string, text: string }[]}
 */
const SECTIONS = [
  { dir: 'guide', text: 'Начало работы' },
  { dir: 'architecture', text: 'Архитектура' },
  { dir: 'data', text: 'Формат данных' },
  { dir: 'reference', text: 'Справочник' },
  { dir: 'recipes', text: 'Рецепты' },
  { dir: 'operations', text: 'Эксплуатация' },
  { dir: 'meta', text: 'О документации' },
];

/**
 * Поле фронтматтера.
 *
 * @param {string} source
 * @param {string} field
 * @returns {string | undefined}
 */
function frontmatterField(source, field) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!block) return undefined;

  const line = new RegExp(`^${field}:\\s*(.+)$`, 'm').exec(block[1]);
  if (!line) return undefined;

  return line[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * Первый заголовок первого уровня — название страницы.
 *
 * @param {string} source
 * @returns {string | undefined}
 */
function firstHeading(source) {
  const heading = /^#\s+(.+)$/m.exec(source);
  return heading ? heading[1].trim() : undefined;
}

/**
 * @typedef {{ text: string, link: string, order: number }} Page
 */

/**
 * @param {string} directory
 * @param {string} file
 * @param {string} dir
 * @returns {Page | null}
 */
function readPage(directory, file, dir) {
  const source = readFileSync(path.join(directory, file), 'utf8');
  const name = file.replace(/\.md$/, '');

  if (name === 'index') return null;

  const order = Number(frontmatterField(source, 'order') ?? Number.POSITIVE_INFINITY);

  return {
    text: frontmatterField(source, 'title') ?? firstHeading(source) ?? name,
    link: `/${dir}/${name}`,
    order: Number.isFinite(order) ? order : Number.POSITIVE_INFINITY,
  };
}

/**
 * @param {string} dir
 * @returns {Page[]}
 */
function pagesOf(dir) {
  const directory = path.join(DOCS_ROOT, dir);
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return [];

  return readdirSync(directory)
    .filter((file) => file.endsWith('.md'))
    .map((file) => readPage(directory, file, dir))
    .filter((page) => page !== null)
    .sort((a, b) => a.order - b.order || a.text.localeCompare(b.text, 'ru'));
}

/**
 * @returns {Record<string, { text: string, items: { text: string, link: string }[] }[]>}
 */
export function buildSidebar() {
  /** @type {Record<string, { text: string, items: { text: string, link: string }[] }[]>} */
  const sidebar = {};

  for (const section of SECTIONS) {
    const pages = pagesOf(section.dir);
    if (pages.length === 0) continue;

    const group = {
      text: section.text,
      items: pages.map(({ text, link }) => ({ text, link })),
    };

    // Один раздел — одна группа на всех страницах раздела.
    sidebar[`/${section.dir}/`] = [group];

    // С главной страницы документации видно все разделы сразу.
    (sidebar['/'] ??= []).push(group);
  }

  return sidebar;
}
