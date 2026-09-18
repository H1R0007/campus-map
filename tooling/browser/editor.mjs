/**
 * Помощники сценариев редактора.
 *
 * Узлы, рёбра и переходы на карте — пути SVG Leaflet с метками
 * `data-node-id`, `data-edge` и `data-transition` (ключ пары — `edgeKey`
 * ядра). Нажатия — настоящие события мыши протокола отладки в точку окна: так
 * сценарий видит то же, что человек, в том числе панель, закрывшую кнопку или
 * узел. `button.click()` нажал бы кнопку сквозь всё, что её закрывает.
 */

import { strict as assert } from 'node:assert';

/** Описание элемента для сообщений об ошибке (выражение для страницы): тег, метки, начало текста. */
const DESCRIBE = `(el) => el
  ? [el.tagName.toLowerCase(), el.getAttribute('aria-label'), el.getAttribute('data-node-id'),
     String(el.className?.baseVal ?? el.className ?? '').slice(0, 60), (el.textContent ?? '').trim().slice(0, 40)]
      .filter(Boolean).join(' | ')
  : 'ничего'`;

const BUTTONS = { left: 1, right: 2, middle: 4 };

/** Коды клавиш Windows для именованных клавиш: без них браузер не всегда рассылает `keydown`. */
const NAMED_KEY_CODES = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Escape: 27,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Delete: 46,
  F2: 113,
};

/** Модификаторы протокола: Alt 1, Ctrl 2, Meta 4, Shift 8. */
export const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

/**
 * @param {Awaited<ReturnType<import('./cdp.mjs').openPage>>} page
 * @param {string} base адрес приложения без завершающего слэша
 */
export function editorHelpers(page, base) {
  const mouse = (type, x, y, { button = 'left', modifiers = 0, buttons } = {}) =>
    page.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: type === 'mouseMoved' && buttons === undefined ? 'none' : button,
      buttons: buttons ?? (type === 'mousePressed' ? BUTTONS[button] : 0),
      clickCount: 1,
      modifiers,
    });

  const helpers = {
    /** Открывает редактор и ждёт узлов на карте. */
    async open(pathAndQuery = '/') {
      await page.goto(`${base}${pathAndQuery}`);
      await page.waitFor(`document.querySelectorAll('path[data-node-id]').length > 0`, 20_000);
      await page.sleep(500);
    },

    /** Нажимает кнопку по подписи или `title` вызовом `click()` — для кнопок панелей. */
    async press(label) {
      const clicked = await page.eval(`(() => {
        const label = ${JSON.stringify(label)};
        const buttons = [...document.querySelectorAll('button')].filter((b) => !b.disabled);
        const button =
          buttons.find((b) => b.textContent.trim() === label || b.getAttribute('title') === label || b.getAttribute('aria-label') === label) ??
          buttons.find((b) => b.textContent.trim().startsWith(label));
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (!clicked) throw new Error(`нет кнопки «${label}»`);
      await page.sleep(400);
    },

    /** Открывает план этажа корпуса через «Слои». */
    async openFloor(building, floor) {
      await helpers.press(building);
      await helpers.press(`Этаж ${floor}`);
      await page.waitFor(`document.querySelectorAll('path[data-node-id]').length > 0`);
      await page.sleep(300);
    },

    /** id узлов открытого плана. */
    nodeIds: () => page.eval(`[...document.querySelectorAll('path[data-node-id]')].map((p) => p.dataset.nodeId)`),

    /**
     * Центр узла в окне; проверяет, что узел не закрыт панелью: щелчок в эту
     * точку придётся именно на него.
     */
    async nodePoint(id) {
      const point = await page.eval(`(() => {
        const path = document.querySelector('path[data-node-id=${JSON.stringify(id)}]');
        if (!path) return null;
        const r = path.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        return { x, y, top: document.elementFromPoint(x, y) === path, cover: (${DESCRIBE})(document.elementFromPoint(x, y)) };
      })()`);
      assert.ok(point, `узла ${id} нет на плане`);
      assert.ok(point.top, `узел ${id} закрыт: ${point.cover}`);
      return point;
    },

    /** Середина линии ребра или перехода в окне. */
    async linePoint(selector) {
      const point = await page.eval(`(() => {
        const path = document.querySelector(${JSON.stringify(selector)});
        if (!path) return null;
        const p = path.getPointAtLength(path.getTotalLength() / 2);
        const m = path.getScreenCTM();
        const x = p.x * m.a + p.y * m.c + m.e;
        const y = p.x * m.b + p.y * m.d + m.f;
        return { x, y, top: document.elementFromPoint(x, y) === path, cover: (${DESCRIBE})(document.elementFromPoint(x, y)) };
      })()`);
      assert.ok(point, `нет линии ${selector}`);
      assert.ok(point.top, `линия ${selector} закрыта: ${point.cover}`);
      return point;
    },

    /** Центр отметки перехода на другой план по подписи («↑ этаж 2») и ключу пары. */
    async transitionRowPoint(key) {
      const point = await page.eval(`(() => {
        const row = document.querySelector('button.transition-target[data-transition=${JSON.stringify(key)}]');
        if (!row) return null;
        const r = row.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        return { x, y, top: row.contains(document.elementFromPoint(x, y)) };
      })()`);
      assert.ok(point, `нет отметки перехода ${key}`);
      assert.ok(point.top, `отметка перехода ${key} закрыта другим элементом`);
      return point;
    },

    /** Точка карты без узлов, линий и панелей: внизу посередине контейнера карты. */
    async emptyMapPoint(dy = 60) {
      const point = await page.eval(`(() => {
        const r = document.querySelector('.leaflet-container').getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.bottom - ${dy};
        const top = document.elementFromPoint(x, y);
        const free = top && !top.closest('path.leaflet-interactive, button, .leaflet-tooltip, [role="menu"], .leaflet-control');
        return { x, y, free: Boolean(free) };
      })()`);
      assert.ok(point.free, 'в выбранной точке карты что-то есть');
      return point;
    },

    mouse,

    async click(x, y, { button = 'left', modifiers = 0 } = {}) {
      await mouse('mouseMoved', x, y, { modifiers });
      await mouse('mousePressed', x, y, { button, modifiers });
      await mouse('mouseReleased', x, y, { button, modifiers });
      await page.sleep(300);
    },

    async drag(x1, y1, x2, y2, { button = 'left', modifiers = 0, steps = 10 } = {}) {
      await mouse('mouseMoved', x1, y1, { modifiers });
      await mouse('mousePressed', x1, y1, { button, modifiers });
      for (let i = 1; i <= steps; i++) {
        await mouse('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, {
          button,
          modifiers,
          buttons: BUTTONS[button],
        });
        await page.sleep(20);
      }
      await mouse('mouseReleased', x2, y2, { button, modifiers });
      await page.sleep(400);
    },

    /**
     * Клавиша с модификаторами. `code` — физическая клавиша: в русской
     * раскладке `key` у неё другой («я» вместо «z»).
     */
    async key(key, { code, modifiers = 0, keyCode } = {}) {
      const text = key.length === 1 && !(modifiers & (MOD.ctrl | MOD.meta | MOD.alt)) ? key : undefined;
      const common = {
        key,
        code: code ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key),
        windowsVirtualKeyCode: keyCode ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : NAMED_KEY_CODES[key]),
        modifiers,
      };
      await page.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...common, ...(text ? { text } : {}) });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
      await page.sleep(300);
    },

    /** Открытые меню: подпись и пункты. */
    menus: () =>
      page.eval(`[...document.querySelectorAll('[role="menu"]')].map((m) => ({
        label: m.getAttribute('aria-label'),
        items: [...m.querySelectorAll('[role^="menuitem"]')].map((i) => i.textContent.trim()),
        checked: [...m.querySelectorAll('[aria-checked="true"]')].map((i) => i.textContent.trim()),
      }))`),

    /** Выбирает пункт открытого меню настоящим щелчком в его центр. */
    async menuPick(label) {
      const point = await page.eval(`(() => {
        const item = [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].find((i) => i.textContent.trim().startsWith(${JSON.stringify(label)}));
        if (!item) return null;
        const r = item.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        return { x, y, top: item.contains(document.elementFromPoint(x, y)) };
      })()`);
      assert.ok(point, `в меню нет пункта «${label}»`);
      assert.ok(point.top, `пункт «${label}» закрыт другим элементом`);
      await helpers.click(point.x, point.y);
    },

    /**
     * Точка элемента внутри карточки свойств: карточка прокручивается к нему,
     * и проверяется, что щелчок в эту точку придётся именно на него.
     */
    async panelPoint(selector) {
      const point = await page.eval(`(() => {
        const panel = document.querySelector('aside[aria-label="Свойства узла"]');
        const el = panel?.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        const at = document.elementFromPoint(x, y);
        return { x, y, top: el === at || el.contains(at), cover: (${DESCRIBE})(at) };
      })()`);
      assert.ok(point, `в карточке свойств нет «${selector}»`);
      assert.ok(point.top, `«${selector}» закрыт: ${point.cover}`);
      return point;
    },

    /** Текст раздела карточки свойств по началу заголовка («Алиасы», «Соседи»). */
    panelSection: (heading) =>
      page.eval(`(() => {
        const panel = document.querySelector('aside[aria-label="Свойства узла"]');
        const section = [...(panel?.querySelectorAll('section') ?? [])].find((s) => s.textContent.trim().startsWith(${JSON.stringify(heading)}));
        return section ? section.textContent.replace(/\\s+/g, ' ').trim() : null;
      })()`),

    /** Набирает текст в поле, которое сейчас в фокусе. */
    async type(text) {
      await page.send('Input.insertText', { text });
      await page.sleep(150);
    },

    /** Значение поля карточки свойств по подписи для диктора. */
    panelValue: (label) =>
      page.eval(`document.querySelector('aside[aria-label="Свойства узла"] [aria-label=${JSON.stringify(label)}]')?.value ?? null`),

    /** Включает или выключает переключатель в панели «Фильтры» по подписи. */
    async toggleFilter(label) {
      const ok = await page.eval(`(() => {
        const box = [...document.querySelectorAll('label')].find((l) => l.textContent.includes(${JSON.stringify(label)}))?.querySelector('input');
        if (!box) return false;
        box.click();
        return true;
      })()`);
      if (!ok) throw new Error(`нет переключателя «${label}»`);
      await page.sleep(300);
    },

    /** Текст сообщения над картой или пустая строка. */
    notice: () => page.eval(`document.querySelector('.editor-notice')?.textContent ?? ''`),

    /** Подписи отметок переходов на другой план («↑ этаж 2»). */
    transitionTargets: () =>
      page.eval(`[...document.querySelectorAll('.transition-target')].map((row) => row.textContent.trim())`),

    /** Пары узлов переходов, отмеченных на открытом плане. */
    transitionKeys: () =>
      page.eval(`[...document.querySelectorAll('[data-transition]')].map((el) => el.dataset.transition)`),

    /** Текст строки состояния. */
    status: () => page.eval(`document.querySelector('footer[aria-label="Строка состояния"]')?.textContent ?? ''`),

    /** Открытый план словами: «Корпус А / Этаж 2» или «Кампус». */
    place: () => page.eval(`document.querySelector('[data-status-place]')?.textContent ?? ''`),

    /** Сколько узлов выбрано — по строке состояния. */
    async selectedCount() {
      const match = (await helpers.status()).match(/Выбрано: (\d+)/);
      return match ? Number(match[1]) : 0;
    },

    /** id узла в карточке свойств или `null`, если карточки нет. */
    propertiesNodeId: () =>
      page.eval(`document.querySelector('aside[aria-label="Свойства узла"]')?.getAttribute('data-node-id') ?? null`),
  };

  return helpers;
}
