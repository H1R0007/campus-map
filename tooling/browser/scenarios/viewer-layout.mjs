import { strict as assert } from 'node:assert';
import { PANEL, SEARCH, viewerHelpers } from '../viewer.mjs';

/**
 * Навигатор: панель, поиск, карточка места, обзор маршрута (запись 17).
 *
 * Написан под тестовый `data/`: «Столовая» в корпусах А и Б, «А-305» на
 * третьем этаже корпуса А, лифт только до второго этажа.
 */
export default {
  app: 'viewer',
  name: 'навигатор: поиск, место, маршрут',

  async run({ page, base, step, shot }) {
    const v = viewerHelpers(page, base);
    await page.viewport(390, 844, 2);

    await step('поиск места: только столовые, имя на языке интерфейса', async () => {
      await v.open('/');
      assert.ok((await v.panelText()).includes('Найти аудиторию или место'));
      await v.click('Найти аудиторию или место');
      await v.typeSearch('canteen');
      const options = await v.options();
      assert.deepEqual(options.map((lines) => lines[0]), ['Столовая', 'Столовая']);
      assert.ok(options.every((lines) => lines[1] === 'Canteen'), 'совпавшее английское имя второй строкой');
      await shot('viewer-search');
      await v.chooseOption('Столовая');
      assert.equal(await v.searchOpen(), false);
      assert.ok((await v.panelText()).includes('Маршрут сюда'));
      assert.ok((await v.headerText()).includes('Этаж 1'), 'карта на этаже места');
      assert.equal(await page.eval('document.activeElement?.tagName'), 'H2', 'фокус на заголовке карточки');
    });

    await step('«Маршрут сюда» открывает поиск начала и строит маршрут', async () => {
      await v.click('Маршрут сюда');
      assert.equal(await page.eval('document.activeElement?.placeholder'), 'Откуда начать маршрут');
      await v.typeSearch('главный вход');
      await v.chooseOption('Главный вход');
      await page.waitFor(`${PANEL}.textContent.includes('Откуда: Главный вход')`);
      const url = new URL(await v.href());
      assert.equal(url.searchParams.get('from'), 'campus_gate');
      assert.equal(url.searchParams.get('to'), 'a1_canteen');
      await shot('viewer-route-peek');
    });

    await step('шторка раскрывается кнопкой, жестом и сворачивается Escape', async () => {
      await v.click('Развернуть панель');
      assert.ok((await v.panelText()).includes('Ограничения'), 'раскрытый обзор');
      await page.key('Escape');
      assert.ok(!(await v.panelText()).includes('Ограничения'), 'Escape свернул');

      const handle = `section[aria-label="Панель навигатора"] > button[aria-expanded]`;
      const [x, y] = await v.center(handle);
      await page.dragVertical(x, y, -90);
      assert.ok((await v.panelText()).includes('Ограничения'), 'жест вверх раскрыл');
      const [x2, y2] = await v.center(handle);
      await page.dragVertical(x2, y2, 90);
      assert.ok(!(await v.panelText()).includes('Ограничения'), 'жест вниз свернул');
    });

    await step('QR у входа: поиск сразу задаёт цель', async () => {
      await v.open('/?at=a1_entrance');
      const text = await v.panelText();
      assert.ok(text.includes('Куда вы хотите попасть?') && text.includes('Главный вход корпуса А'));
      await v.click('Куда вы хотите попасть?');
      await v.typeSearch('305');
      await v.chooseOption('А-305');
      await page.waitFor(`${PANEL}.querySelector('h2')?.textContent === 'А-305'`);
      assert.ok((await v.headerText()).includes('Этаж 1'), 'карта на этаже начала');
    });

    await step('без лестниц до третьего этажа не дойти — «Разрешить лестницы»', async () => {
      await v.click('Шаги');
      await v.click('Без лестниц');
      await page.waitFor(`${PANEL}.textContent.includes('Маршрут не найден')`);
      await v.click('Свернуть панель');
      assert.ok((await v.panelText()).includes('Разрешить лестницы'), 'выход из тупика в свёрнутой шторке');
      await v.click('Разрешить лестницы');
      await page.waitFor(`${PANEL}.textContent.includes('Маршрут ·')`);
    });

    await step('смена языка переименовывает точки; этажи видны при раскрытой шторке', async () => {
      await v.click('English');
      await page.waitFor(`${PANEL}.textContent.includes('Route ·')`);
      await v.click('Expand the panel');
      assert.ok((await v.panelText()).includes('Building A main entrance'));
      const rail = await page.eval(`(() => {
        const list = document.querySelector('.campus-floor-list');
        return { floors: list ? list.getBoundingClientRect().height : 0, zoom: !!document.querySelector('.campus-zoom-controls') };
      })()`);
      assert.ok(rail.floors >= 44 && !rail.zoom, `колонка этажей: ${JSON.stringify(rail)}`);
      await v.click('Русский');
    });

    await step('«Поделиться» без буфера обмена — окно со ссылкой', async () => {
      await page.eval('delete Navigator.prototype.share; delete Navigator.prototype.clipboard;');
      await v.click('Поделиться маршрутом');
      await page.waitFor(`document.body.innerText.includes('Скопируйте ссылку')`);
      const field = await page.eval(`(() => { const i = document.activeElement; return { value: i.value, selected: i.selectionEnd - i.selectionStart, href: location.href }; })()`);
      assert.equal(field.value, field.href);
      assert.equal(field.selected, field.value.length, 'ссылка выделена целиком');
      await page.key('Escape');
      assert.equal(await page.eval(`document.activeElement?.getAttribute('aria-label')`), 'Поделиться маршрутом');
    });

    await step('ссылка только с целью открывает её карточку', async () => {
      await v.open('/?to=a3_room305');
      assert.ok((await v.panelText()).includes('Маршрут сюда'));
      assert.ok((await v.headerText()).includes('Этаж 3'));
      await page.eval(`${PANEL}.querySelector('h2').focus()`);
      await page.key('Escape');
      const idle = await v.panelText();
      assert.ok(idle.includes('Откуда начать маршрут?') && idle.includes('А-305'), 'поиск начала и точка цели');
    });

    await step('нажатие на точку плана открывает карточку места', async () => {
      await v.open('/');
      await v.click('Корпус А');
      await page.sleep(900);
      const points = await page.eval(
        `[...document.querySelectorAll('.campus-marker--portal')].map((m) => { const r = m.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })`
      );
      let opened = false;
      for (const [x, y] of points) {
        await page.tap(x, y);
        if (await page.eval(`!!${PANEL}.querySelector('h2')`)) {
          opened = true;
          break;
        }
      }
      assert.ok(opened, 'карточка открылась');
    });

    await step('лишний слэш в адресе не ломает ссылку маршрута', async () => {
      await v.open('//');
      await v.click('Найти аудиторию или место');
      await v.typeSearch('библиотека');
      await v.chooseOption('Библиотека');
      await v.click('Маршрут сюда');
      await v.typeSearch('Главный вход');
      await v.chooseOption('Главный вход');
      const url = new URL(await v.href());
      assert.equal(url.origin, base);
      assert.equal(url.searchParams.get('to'), 'b1_library');
    });

    await page.viewport(1440, 900, 1);

    await step('широкий экран: панель слева не закрывает маршрут и шапку', async () => {
      await v.open('/?from=campus_gate&to=b2_lab');
      await page.sleep(900);
      const layout = await page.eval(`(() => {
        const panel = ${PANEL}.getBoundingClientRect();
        const lines = [...document.querySelectorAll('.campus-route-line')].map((l) => l.getBoundingClientRect().left);
        return { panelRight: panel.right, lineLeft: Math.min(...lines), headerLeft: document.querySelector('.campus-map-header').getBoundingClientRect().left };
      })()`);
      assert.ok(layout.lineLeft >= layout.panelRight, `линия правее панели: ${JSON.stringify(layout)}`);
      assert.ok(layout.headerLeft >= layout.panelRight, 'шапка правее панели');
      assert.ok((await v.panelText()).includes('Шаги маршрута'), 'подробности видны сразу');
      await shot('viewer-desktop-route');
    });

    await step('широкий экран: поиск на месте панели, выбор стрелкой и Enter', async () => {
      await v.open('/');
      await v.click('Найти аудиторию или место');
      await v.typeSearch('зал');
      await page.key('ArrowDown');
      await page.key('Enter');
      assert.equal(await page.eval(`!!${SEARCH}`), false, 'Enter выбрал место');
    });
  },
};
