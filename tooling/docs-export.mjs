#!/usr/bin/env node
/**
 * Сборка документации в один файл HTML.
 *
 * Зачем: сайт удобен, пока есть сеть и сервер, но документацию приходится
 * передавать — вузу, новому разработчику, в архив проекта. Ссылку передать
 * нельзя, а папку со сборкой неудобно: она требует веб-сервера, иначе стили и
 * переходы между страницами не работают.
 *
 * Поэтому из готовой сборки VitePress собирается один самодостаточный файл:
 * стили внутри, страницы подряд в порядке навигации, внутренние ссылки
 * превращены в переходы по якорям. Файл открывается двойным щелчком в любом
 * браузере, работает без сети и печатается в PDF штатным «Печать → Сохранить
 * как PDF» (`tooling/docs-pdf.mjs` делает это без участия человека).
 *
 * Что важно и почему так:
 *
 * - **Порядок страниц берётся из той же навигации**, что и на сайте
 *   (`docs/.vitepress/sidebar.mjs`). Второй список порядка разошёлся бы с
 *   первым на первой же новой главе.
 * - **Идентификаторы заголовков получают префикс страницы**: в одном файле
 *   десять разделов «Поля» иначе указывали бы друг на друга.
 * - **Внешние ссылки остаются ссылками**, внутренние становятся якорями.
 *   Ссылка на страницу, которой в файле нет, теряет `href`: мёртвая ссылка в
 *   переданном документе хуже, чем просто текст.
 *
 * Использование:
 *   pnpm docs:build && pnpm docs:export      # сайт, затем один файл
 *   node tooling/docs-export.mjs --site docs/dist --out docs/dist-offline
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSidebar } from '../docs/.vitepress/sidebar.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Заголовок документа на обложке. */
const TITLE = 'Карта кампуса. Документация';

function parseArgs(argv) {
  const options = {
    site: path.join(REPO_ROOT, 'docs', 'dist'),
    out: path.join(REPO_ROOT, 'docs', 'dist-offline'),
    name: 'campus-map-docs',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--site') options.site = path.resolve(argv[++i]);
    else if (key === '--out') options.out = path.resolve(argv[++i]);
    else if (key === '--name') options.name = argv[++i];
  }

  return options;
}

/**
 * Вырезает содержимое страницы из готового HTML.
 *
 * Разметка темы VitePress: статья лежит в `<div class="vp-doc …">` внутри
 * `VPDoc`. Классы темы — не наш контракт, но других зацепок в собранном HTML
 * нет, поэтому зацепка одна и проверяется: если статьи не нашлось, сборка
 * упадёт с понятным сообщением, а не выпустит пустой файл.
 *
 * @param {string} html
 * @param {string} file путь для сообщения об ошибке
 * @returns {string} внутренняя разметка статьи
 */
function extractArticle(html, file) {
  const marker = /<div[^>]*class="vp-doc[^"]*"[^>]*>/.exec(html);
  if (!marker) {
    throw new Error(`в ${file} не найдена разметка статьи (div.vp-doc): изменилась тема VitePress?`);
  }

  // Ищем парный закрывающий тег: внутри статьи есть вложенные div.
  const body = html.slice(marker.index);
  let depth = 0;
  let index = 0;

  while (index < body.length) {
    const open = body.indexOf('<div', index);
    const close = body.indexOf('</div>', index);

    if (close === -1) break;
    if (open !== -1 && open < close) {
      depth += 1;
      index = open + 4;
    } else {
      depth -= 1;
      index = close + 6;
      if (depth === 0) return body.slice(0, index);
    }
  }

  throw new Error(`в ${file} не закрыт div статьи`);
}

/**
 * Текст без разметки.
 *
 * Кроме тегов убирается нулевой пробел (U+200B): VitePress ставит его внутрь
 * ссылки заголовка, и в оглавлении он превращается в невидимый хвост.
 */
function plainText(html) {
  return decodeEntities(
    html.replace(/<a class="header-anchor"[\s\S]*?<\/a>/g, '').replace(/<[^>]+>/g, '')
  )
    .replace(/\u200B/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Сущности HTML, которые VitePress ставит в идентификаторы заголовков. */
function decodeEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Значение атрибута: кавычка и амперсанд обратно в сущности. */
function escapeAttribute(text) {
  return text.replace(/&(?![a-zA-Z#]+;)/g, '&amp;').replace(/"/g, '&quot;');
}

/** Ключ страницы в файле: `/data/node` → `data-node`. */
function slugOf(route) {
  return route.replace(/^\//, '').replace(/[/#?]+/g, '-').replace(/-+$/, '') || 'index';
}

/** Все стили сборки одной строкой: в переданном файле внешних файлов быть не может. */
function collectStyles(site) {
  const assets = path.join(site, 'assets');
  const files = existsSync(assets)
    ? readdirSync(assets).filter((file) => file.endsWith('.css')).map((file) => path.join(assets, file))
    : [];

  const icons = path.join(site, 'vp-icons.css');
  if (existsSync(icons)) files.push(icons);

  return (
    files
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
      // Шрифты Inter тема подключает файлами из `/assets/`. В отдельном файле
      // таких путей нет: оставляем системные шрифты, а не битые запросы.
      .replace(/@font-face\{[^}]*\}/g, '')
      .replace(/url\(\/assets\/[^)]*\)/g, 'none')
  );
}

/** Разметка страницы с префиксом и переписанными ссылками. */
function rewriteArticle(article, slug, knownRoutes) {
  let html = article;

  // Подвал страницы сайта несёт ссылки «Предыдущая» и «Следующая»: в файле
  // страницы идут подряд, и переход по ним только сбивает место чтения.
  html = html.replace(/<footer[\s\S]*?<\/footer>/g, '');

  // Кнопка «копировать код» — в файле без скриптов она мертва.
  html = html.replace(/<button[^>]*class="copy"[^>]*><\/button>/g, '');
  // Значок внешней ссылки рисуется скриптом и без него остаётся пустым.
  html = html.replace(/<span class="vp-external-link-icon"[^>]*><\/span>/g, '');

  // Якоря: у каждого заголовка свой id, в одном файле их нужно развести.
  // VitePress записывает кавычки в id сущностями (`&quot;`), а в ссылке на
  // заголовок — обычными знаками. Разворачиваем сущности, иначе id `…-«готовым»`
  // и ссылка на него перестают совпадать.
  html = html.replace(/id="([^"]+)"/g, (_, id) => `id="${escapeAttribute(`${slug}--${decodeEntities(id)}`)}"`);
  html = html.replace(/href="#([^"]+)"/g, (_, id) => `href="#${escapeAttribute(`${slug}--${decodeEntities(id)}`)}"`);

  // Внутренние ссылки на страницы документации.
  html = html.replace(/href="(\/[^"]*)"/g, (match, target) => {
    const [route, hash] = target.split('#');

    if (route === '/') return 'href="#cover"';

    const key = route.replace(/\.html$/, '');
    if (!knownRoutes.has(key)) return ''; // ссылка на страницу, которой в файле нет

    return hash ? `href="#${slugOf(key)}--${hash}"` : `href="#${slugOf(key)}"`;
  });

  // Картинки, если появятся, встраиваются в файл: внешних путей в нём быть не может.
  return html;
}

/** Заголовки статьи для оглавления. */
function headingsOf(article) {
  const headings = [];
  const pattern = /<h([23])[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;

  for (const [, level, id, inner] of article.matchAll(pattern)) {
    const text = plainText(inner);

    if (text) headings.push({ level: Number(level), id, text });
  }

  return headings;
}

/** Заголовок первого уровня — название страницы в оглавлении документа. */
function pageTitle(article) {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(article);
  if (!match) return '';
  return plainText(match[1]);
}

function gitValue(args, fallback) {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Печатные стили: то, что на сайте делает навигация, в файле делает бумага. */
const PRINT_CSS = `
  :root {
    --vp-font-family-base: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --vp-font-family-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    --doc-ink: #1c1e21;
    --doc-muted: #5b6169;
    --doc-rule: #d7dade;
    --doc-code-bg: #f5f6f7;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: var(--doc-ink);
    font: 16px/1.6 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }

  body {
    max-width: 44rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }

  .doc-cover {
    border-bottom: 2px solid var(--doc-ink);
    margin-bottom: 2.5rem;
    padding-bottom: 1.5rem;
  }

  .doc-cover h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 .5rem; }
  .doc-cover dl { margin: 1rem 0 0; font-size: .9rem; color: var(--doc-muted); }
  .doc-cover dt { float: left; clear: left; width: 8.5rem; }
  .doc-cover dd { margin: 0 0 .15rem 8.5rem; }

  .doc-toc { margin: 2rem 0 3rem; }
  .doc-toc h2 { font-size: 1.1rem; text-transform: uppercase; letter-spacing: .04em; color: var(--doc-muted); }
  .doc-toc ol { list-style: none; padding: 0; margin: 0; }
  .doc-toc > ol > li { margin: .35rem 0; }
  .doc-toc .toc-pages { margin-left: 1rem; font-size: .9rem; color: var(--doc-muted); }
  .doc-toc a { color: inherit; text-decoration: none; border-bottom: 1px solid transparent; }
  .doc-toc a:hover { border-bottom-color: currentColor; }

  .doc-page { border-top: 1px solid var(--doc-rule); padding-top: 1.5rem; margin-top: 2.5rem; }
  .doc-page:first-of-type { border-top: none; padding-top: 0; }

  /* Содержимое берётся из темы VitePress: её типографика уже устраивает,
     здесь только то, что зависит от ширины листа и печати. */
  .vp-doc { font-size: 1rem; }
  .vp-doc table { display: table; width: 100%; font-size: .92rem; }
  .vp-doc th, .vp-doc td { border: 1px solid var(--doc-rule); padding: .4rem .55rem; }
  .vp-doc div[class*="language-"] { background: var(--doc-code-bg); }
  .vp-doc pre { font-size: .82rem; line-height: 1.45; overflow-x: auto; }
  .vp-doc .header-anchor { display: none; }

  @media print {
    @page { size: A4; margin: 18mm 16mm 20mm; }

    body { max-width: none; padding: 0; font-size: 10.5pt; }
    .doc-page { break-before: page; }
    .doc-page:first-of-type { break-before: auto; }

    h1, h2, h3 { break-after: avoid; }
    pre, table, blockquote, .custom-block { break-inside: avoid; }
    tr, li { break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
`;

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!existsSync(path.join(options.site, 'index.html'))) {
    throw new Error(`Нет собранного сайта в ${options.site}. Сначала pnpm docs:build.`);
  }

  const sidebar = buildSidebar();
  const routes = (sidebar['/'] ?? []).flatMap((group) =>
    group.items.map((item) => ({ route: item.link, group: group.text }))
  );

  const knownRoutes = new Set(routes.map((item) => item.route));

  const pages = [];
  const warnings = [];

  for (const { route, group } of routes) {
    const slug = slugOf(route);
    const file = path.join(options.site, `${route.replace(/^\//, '')}.html`);

    if (!existsSync(file) || !statSync(file).isFile()) {
      warnings.push(`страница ${route} есть в навигации, но не собрана (${file})`);
      continue;
    }

    const article = extractArticle(readFileSync(file, 'utf8'), file);
    const html = rewriteArticle(article, slug, knownRoutes);
    const title = pageTitle(article);

    pages.push({ route, slug, group, title: title || route, html, headings: headingsOf(html) });
  }

  if (pages.length === 0) throw new Error('в сборке не нашлось ни одной страницы документации');

  const date = new Date().toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
  const commit = gitValue(['rev-parse', '--short', 'HEAD'], '—');
  const branch = gitValue(['rev-parse', '--abbrev-ref', 'HEAD'], '—');

  const toc = pages
    .map(
      (page) => `
      <li>
        <a href="#${page.slug}">${page.title}</a>
        <span class="doc-toc-group">${page.group}</span>
        ${page.headings
          .filter((heading) => heading.level === 2)
          .map((heading) => `<a class="toc-page" href="#${heading.id}">${heading.text}</a>`)
          .join(' · ')}
      </li>`
    )
    .join('');

  const sections = pages
    .map((page) => `<section class="doc-page" id="${page.slug}">\n${page.html}\n</section>`)
    .join('\n');

  const document = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE}</title>
<style>${collectStyles(options.site)}</style>
<style>${PRINT_CSS}</style>
</head>
<body>

<header class="doc-cover" id="cover">
  <h1>${TITLE}</h1>
  <p>Навигатор по кампусу и редактор разметки: формат данных, устройство кода, эксплуатация.</p>
  <dl>
    <dt>Собрано</dt><dd>${date}</dd>
    <dt>Коммит</dt><dd>${commit} (ветка ${branch})</dd>
    <dt>Источник</dt><dd>https://github.com/H1R0007/campus-map</dd>
    <dt>Страниц</dt><dd>${pages.length}</dd>
  </dl>
</header>

<nav class="doc-toc">
  <h2>Содержание</h2>
  <ol>${toc}</ol>
</nav>

${sections}

</body>
</html>
`;

  mkdirSync(options.out, { recursive: true });
  const file = path.join(options.out, `${options.name}.html`);
  writeFileSync(file, document, 'utf8');

  for (const warning of warnings) process.stderr.write(`предупреждение: ${warning}\n`);

  const size = (statSync(file).size / 1024).toFixed(0);
  process.stdout.write(`Файл: ${file} (${size} КБ, страниц: ${pages.length})\n`);
}

main();
