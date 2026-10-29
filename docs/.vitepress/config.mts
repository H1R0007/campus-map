import { defineConfig } from 'vitepress';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSidebar } from './sidebar.mjs';

const DOCS_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Документация проекта «Карта кампуса».
 *
 * Контент — обычный Markdown, VitePress только рендерер: файлы читаются и на
 * GitHub, и в любом редакторе. Страницы не перечисляются в конфиге — их
 * собирает `sidebar.mts` обходом каталога, поэтому новая глава не требует
 * правки настройки.
 *
 * Проверки, которые даёт сборка:
 *
 * - битая внутренняя ссылка — ошибка сборки;
 * - ссылка на несуществующий заголовок в другой странице — тоже;
 * - из проверки исключены только адреса вида `http://localhost:3000`:
 *   это примеры для разработчика, а не ссылки;
 * - внешние ссылки проверяются глазами: сеть в CI есть не всегда.
 *
 * Базовый путь развёртывания задаётся снаружи, как и у самих приложений:
 * документация может стоять и в корне домена, и в подкаталоге.
 *
 *   DOCS_BASE_PATH=/campus-map/ pnpm docs:build
 */
const base = normalizeBase(process.env.DOCS_BASE_PATH);

function normalizeBase(value?: string): string {
  if (!value) return '/';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

/** Отпечаток содержимого всех страниц: по нему видно, что документация изменилась. */
function docsFingerprint(): string {
  const hash = createHash('sha1');

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (entry === '.vitepress' || entry === 'dist' || entry === 'node_modules') continue;
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.md')) {
        hash.update(path.relative(DOCS_ROOT, full)).update(readFileSync(full));
      }
    }
  };

  walk(DOCS_ROOT);
  return hash.digest('hex').slice(0, 8);
}

export default defineConfig({
  lang: 'ru-RU',
  title: 'Карта кампуса',
  description: 'Документация проекта: навигатор по кампусу и редактор разметки',
  base,
  // Что не попадает на сайт: архивные документы и передача дел между сессиями
  // (`STATUS.md` живёт в репозитории, но это не справочник для читателя).
  srcExclude: ['archive/**', 'README.md', 'STATUS.md'],
  cleanUrls: true,

  // Локальные адреса разработки в тексте — не ссылки, а примеры: проверять их
  // доступность на машине сборки бессмысленно.
  ignoreDeadLinks: [/^https?:\/\/localhost/],

  /**
   * Настройки dev-сервера документации.
   *
   * `allowedHosts` открыт намеренно: сайт документации смотрят не только с
   * `localhost`, но и через прокси (облачная среда, общий сервер команды), а
   * Vite отвечает на чужое имя хоста `403 Blocked request`. В прод-сборке это
   * ни на что не влияет: раздаётся статика, Vite-сервера там нет.
   */
  vite: {
    server: {
      allowedHosts: true,
    },
  },

  head: [
    ['meta', { name: 'theme-color', content: '#0063CC' }],
  ],

  markdown: {
    // Языки, которые встречаются в примерах проекта.
    languageAlias: { jsonc: 'json' },
  },

  themeConfig: {
    // Локальный поиск: без внешних сервисов — та же причина, что и в самих
    // приложениях (развёртывание в изолированной сети).
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Поиск', buttonAriaLabel: 'Поиск по документации' },
          modal: {
            noResultsText: 'Ничего не найдено',
            resetButtonTitle: 'Сбросить',
            footer: {
              selectText: 'выбрать',
              navigateText: 'перейти',
              closeText: 'закрыть',
            },
          },
        },
      },
    },

    outline: { level: [2, 3], label: 'На этой странице' },

    docFooter: { prev: 'Назад', next: 'Дальше' },
    darkModeSwitchLabel: 'Тема',
    returnToTopLabel: 'Наверх',
    sidebarMenuLabel: 'Разделы',
    nav: [
      { text: 'Начало работы', link: '/guide/quickstart', activeMatch: '/guide/' },
      { text: 'Архитектура', link: '/architecture/what-it-is', activeMatch: '/architecture/' },
      { text: 'Данные', link: '/data/layout', activeMatch: '/data/' },
      { text: 'Репозиторий', link: 'https://github.com/H1R0007/campus-map' },
    ],

    sidebar: buildSidebar(),

    editLink: {
      pattern: 'https://github.com/H1R0007/campus-map/edit/master/docs/:path',
      text: 'Предложить правку на GitHub',
    },

    footer: {
      message: `Сборка документации · ${docsFingerprint()}`,
      copyright: 'Карта кампуса',
    },
  },
});
