import { strict as assert } from 'node:assert';
import { editorHelpers } from '../editor.mjs';
import { LOW_CONTRAST } from '../contrast.mjs';

/**
 * Редактор: читаемость и размеры.
 *
 * Тем же мерилом, что и навигатор (записи 18 и 21): у видимого текста
 * контраст не ниже 4,5:1, у крупного — 3:1. Плюс размеры, о которых легко
 * забыть в плотном интерфейсе: у кнопок и полей сторона не меньше 44 пикселей
 * (палец и неточная мышь), у полей ввода шрифт не мельче 16 пикселей.
 */
export default {
  app: 'editor',
  name: 'редактор: читаемость и размеры',

  async run({ page, base, step }) {
    await page.viewport(1600, 900, 1);
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
          if (getComputedStyle(el).visibility === 'hidden') continue;
          if (r.height < 44 || r.width < 24) small.push(label(el) + ': ' + Math.round(r.width) + 'x' + Math.round(r.height));
        }
        return small;
      })()`);

    /** Поля ввода с мелким шрифтом: на телефоне такое поле браузер увеличивает сам. */
    const smallText = () =>
      page.eval(`(() => {
        const small = [];
        for (const el of document.querySelectorAll('input, textarea, select')) {
          if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'range' || el.type === 'file' || el.hidden) continue;
          const size = Number.parseFloat(getComputedStyle(el).fontSize);
          if (size < 16) small.push((el.getAttribute('aria-label') ?? el.placeholder ?? el.name) + ': ' + size + 'px');
        }
        return small;
      })()`);

    const checkSizes = async (where) => {
      assert.deepEqual(await smallTargets(), [], `${where}: мелкие цели нажатия`);
      assert.deepEqual(await smallText(), [], `${where}: мелкий шрифт в поле ввода`);
    };

    await step('план, карточка узла и строка состояния: контраст и размеры', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);
      await checkContrast('план без выбора');
      await checkSizes('план без выбора');

      const room = await e.nodePoint('a1_room101');
      await e.click(room.x, room.y);
      await checkContrast('карточка узла');
      await checkSizes('карточка узла');
    });

    await step('вкладки «Проверка» и «Маршрут», инструмент «Переход»', async () => {
      for (const tab of ['Проверка', 'Маршрут']) {
        await e.press(tab);
        await checkContrast(`вкладка «${tab}»`);
        await checkSizes(`вкладка «${tab}»`);
      }
      await e.press('Свойства');

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
