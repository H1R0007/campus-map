import { strict as assert } from 'node:assert';
import { editorHelpers } from '../editor.mjs';
import { LOW_CONTRAST } from '../contrast.mjs';

/**
 * Редактор: читаемость и размеры.
 *
 * Тем же мерилом, что и навигатор (записи 18 и 21): у видимого текста
 * контраст не ниже 4,5:1, у крупного — 3:1. Плюс размеры, о которых легко
 * забыть в плотном интерфейсе. Редактор — только для компьютера (запись 59):
 * у кнопок и полей высота не меньше 32 пикселей, у значка ⓘ — 24 (наименьшая
 * цель по WCAG 2.2), у полей ввода шрифт не мельче 13 пикселей.
 */
export default {
  app: 'editor',
  name: 'редактор: читаемость и размеры',

  async run({ page, base, step }) {
    await page.viewport(1600, 900, 1);
    // Система — тёмная: тема «как в системе» открывается тёмной, светлая
    // проверяется своим шагом (запись 56).
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    const e = editorHelpers(page, base);

    const checkContrast = async (where) => {
      const bad = await page.eval(LOW_CONTRAST);
      assert.deepEqual(bad, [], `${where}: бледный текст ${JSON.stringify(bad.slice(0, 4))}`);
    };

    /**
     * Мелкие цели нажатия. Флажок и переключатель меряются строкой-подписью,
     * в которую они вложены: нажимают по всей строке. Ползунок исключён — он
     * тонкий по своей природе, отметки переходов на самой карте — тоже: это
     * метки плана рядом с узлом, а не кнопки панели.
     */
    const smallTargets = () =>
      page.eval(`(() => {
        const label = (el) => (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent ?? el.tagName).trim().slice(0, 40);
        const small = [];
        for (const el of document.querySelectorAll('button, [role="tab"], [role="option"], input, select, textarea, a[href]')) {
          if (el.disabled || el.hidden || el.type === 'range' || el.type === 'file') continue;
          if (el.closest('.leaflet-pane')) continue;
          const box = (el.type === 'checkbox' || el.type === 'radio') ? (el.closest('label') ?? el) : el;
          const r = box.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          // Значок ⓘ рядом с подписью — 24×24, наименьшая цель по WCAG 2.2 (запись 58).
          if (el.classList.contains('editor-info') && r.width >= 24 && r.height >= 24) continue;
          if (getComputedStyle(el).visibility === 'hidden') continue;
          if (r.height < 32 || r.width < 24) small.push(label(el) + ': ' + Math.round(r.width) + 'x' + Math.round(r.height));
        }
        return small;
      })()`);

    /** Поля ввода с мелким шрифтом: читать и набирать в них трудно. */
    const smallText = () =>
      page.eval(`(() => {
        const small = [];
        for (const el of document.querySelectorAll('input, textarea, select')) {
          if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'range' || el.type === 'file' || el.hidden) continue;
          const size = Number.parseFloat(getComputedStyle(el).fontSize);
          if (size < 13) small.push((el.getAttribute('aria-label') ?? el.placeholder ?? el.name) + ': ' + size + 'px');
        }
        return small;
      })()`);

    const checkSizes = async (where) => {
      assert.deepEqual(await smallTargets(), [], `${where}: мелкие цели нажатия`);
      assert.deepEqual(await smallText(), [], `${where}: мелкий шрифт в поле ввода`);
    };

    await step('план, карточка узла и строка состояния: контраст и размеры', async () => {
      await e.open();
      assert.equal(await page.eval('document.documentElement.dataset.theme'), 'dark', 'тема не взята из системы');
      await e.openFloor('Корпус А', 1);
      await checkContrast('план без выбора');
      await checkSizes('план без выбора');

      const room = await e.nodePoint('a1_room101');
      await e.click(room.x, room.y);
      await checkContrast('карточка узла');
      await checkSizes('карточка узла');
    });

    await step('пояснение ⓘ: открывается наведением и щелчком, читается, закрывается Escape (запись 58)', async () => {
      const room = await e.nodePoint('a1_room101');
      await e.click(room.x, room.y);
      const info = await e.rect('button[aria-label="Пояснение: Названия"]');
      assert.ok(info, 'нет ⓘ у названий');
      await e.click(info.left + info.width / 2, info.top + info.height / 2);
      const tip = () => page.eval(`document.querySelector('.editor-info__tip[role="tooltip"]')?.textContent ?? ''`);
      assert.match(await tip(), /главное/, 'пояснение не открылось');
      await checkContrast('пояснение ⓘ');
      await e.key('Escape', { keyCode: 27 });
      assert.equal(await tip(), '', 'Escape не закрыл пояснение');
      assert.equal(await e.propertiesNodeId(), 'a1_room101', 'Escape в пояснении снял выбор точки');

      // Меню настроек закрывается своим Escape и выбор не трогает.
      await e.press('Настройки');
      await page.eval(`document.querySelector('.editor-menu__option input')?.focus()`);
      await e.key('Escape', { keyCode: 27 });
      assert.equal(await page.eval(`document.querySelector('.editor-menu__popover') === null`), true, 'Escape не закрыл меню настроек');
      assert.equal(await e.propertiesNodeId(), 'a1_room101', 'Escape в меню настроек снял выбор точки');
    });

    await step('вкладки «Проверка» и «Маршрут», инструмент «Переход»', async () => {
      await e.mode('Проверка');
      for (const tab of ['Замечания', 'Маршрут']) {
        await e.press(tab);
        await checkContrast(`вкладка «${tab}»`);
        await checkSizes(`вкладка «${tab}»`);
      }
      await e.mode('Разметка');

      await e.press('Переход (T)');
      await checkContrast('инструмент «Переход»');
      await checkSizes('инструмент «Переход»');
      await e.press('Выбор (V)');
    });

    await step('поиск, справка и меню правой кнопки', async () => {
      await e.key('f', { modifiers: 2 });
      await e.type('101');
      await page.sleep(200);
      await checkContrast('поиск');
      await checkSizes('поиск');
      await e.key('Escape', { keyCode: 27 });

      await e.key('F1', { keyCode: 112 });
      await checkContrast('справка');
      await checkSizes('справка');
      await e.key('Escape', { keyCode: 27 });

      const room = await e.nodePoint('a1_room101');
      await e.click(room.x, room.y, { button: 'right' });
      await checkContrast('меню узла');
      await checkSizes('меню узла');
      await e.key('Escape', { keyCode: 27 });
    });

    await step('светлая тема (запись 56): контраст, выбор помнится после перезагрузки', async () => {
      await e.press('Настройки');
      await checkContrast('меню настроек');
      await checkSizes('меню настроек');
      await page.eval(`[...document.querySelectorAll('.editor-menu__option')].find((l) => l.textContent.includes('Светлая')).querySelector('input').click()`);
      await page.sleep(300);
      assert.equal(await page.eval('document.documentElement.dataset.theme'), 'light');
      await e.key('Escape', { keyCode: 27 });

      await e.open();
      assert.equal(await page.eval('document.documentElement.dataset.theme'), 'light', 'светлая тема забыта после перезагрузки');
      await e.press('Территория');
      await page.waitFor(`document.querySelectorAll('.transition-target').length > 0`, 8000);
      await checkContrast('светлая: территория, подписи переходов на плашках');
      await e.openFloor('Корпус А', 1);
      await checkContrast('светлая: план');
      const room = await e.nodePoint('a1_room101');
      await e.click(room.x, room.y);
      await checkContrast('светлая: карточка узла');
      await e.mode('Проверка');
      for (const tab of ['Замечания', 'Маршрут']) {
        await e.press(tab);
        await checkContrast(`светлая: вкладка «${tab}»`);
      }
      await e.mode('Планы и корпуса');
      await checkContrast('светлая: «Планы и корпуса»');
      await e.mode('Разметка');
      await e.key('F1', { keyCode: 112 });
      await checkContrast('светлая: справка');
      await e.key('Escape', { keyCode: 27 });

      await e.press('Настройки');
      await page.eval(`[...document.querySelectorAll('.editor-menu__option')].find((l) => l.textContent.includes('Как в системе')).querySelector('input').click()`);
      await e.key('Escape', { keyCode: 27 });
      assert.equal(await page.eval('document.documentElement.dataset.theme'), 'dark', '«как в системе» не вернуло тёмную');

      // Система сменила тему — редактор следом, без перезагрузки.
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
      await page.sleep(300);
      assert.equal(await page.eval('document.documentElement.dataset.theme'), 'light', 'тема не пошла за системой');
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
      await page.sleep(300);
    });

    await step('экран ноутбука 1280×720: текст не бледнеет и кнопки не мельчают', async () => {
      await page.viewport(1280, 720, 1);
      await page.sleep(400);
      const room = await e.nodePoint('a1_room102');
      await e.click(room.x, room.y);
      await checkContrast('1280×720');
      await checkSizes('1280×720');
      await page.viewport(1600, 900, 1);
    });
  },
};
