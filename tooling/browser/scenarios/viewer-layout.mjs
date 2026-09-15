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
      const header = await v.headerText();
      assert.ok(header.includes('Этаж 1'), `карта на этаже места: ${header}`);
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

    await step('поиск места находит корпус по названию и открывает его', async () => {
      await v.open('/');
      await v.click('Найти аудиторию или место');
      await page.waitFor(`document.activeElement?.getAttribute('role') === 'combobox'`);
      await page.eval(`(() => {
        const input = document.activeElement;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'корпус б');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      const building = `[...document.querySelectorAll('[data-search-view] button')].find((b) => b.textContent.includes('Корпус Б'))`;
      await page.waitFor(`!!${building}`);
      await page.eval(`${building}.click()`);
      await page.waitFor(
        `!document.querySelector('[data-search-view]') && document.querySelector('.campus-map-header').innerText.includes('Корпус Б')`
      );
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
      await v.openBuilding('Корпус А');
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

    await step('широкий экран: за последним чипом ленты нажатие достаётся карте', async () => {
      await v.open('/');
      const underGap = await page.eval(`(() => {
        const chips = [...document.querySelectorAll('.campus-map-header button:not([lang])')];
        const last = chips[chips.length - 1].getBoundingClientRect();
        return !!document.elementFromPoint(last.right + 40, last.top + last.height / 2)?.closest('.leaflet-container');
      })()`);
      assert.equal(underGap, true, 'лента не забирает нажатия у карты');
    });

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

    await page.viewport(844, 390, 2);

    await step('телефон лёжа: панель слева, этажи и маршрут на карте справа от неё', async () => {
      await v.open('/?from=a1_entrance&to=a3_room305');
      await page.sleep(900);
      const layout = await page.eval(`(() => {
        const panel = ${PANEL}.getBoundingClientRect();
        const lines = [...document.querySelectorAll('.campus-route-line')].map((l) => l.getBoundingClientRect().left);
        const floors = document.querySelector('.campus-floor-list')?.getBoundingClientRect();
        return { panelTop: panel.top, panelRight: panel.right, lineLeft: Math.min(...lines), floors: floors ? floors.height : 0 };
      })()`);
      assert.ok(layout.panelTop < 40 && layout.panelRight <= 440, `панель слева: ${JSON.stringify(layout)}`);
      assert.ok(layout.lineLeft >= layout.panelRight, `маршрут правее панели: ${JSON.stringify(layout)}`);
      assert.ok(layout.floors >= 132, `видны три этажа: ${JSON.stringify(layout)}`);

      await v.click('Начать');
      const header = await page.eval(`(() => {
        const language = document.querySelector('.campus-map-header [role="group"]').getBoundingClientRect();
        return { right: language.right, width: innerWidth };
      })()`);
      assert.ok(header.right <= header.width, `язык в шапке в пути целиком: ${JSON.stringify(header)}`);
      await shot('viewer-landscape');
      await v.click('Завершить пошаговую навигацию');
    });

    await page.viewport(195, 422, 4);

    await step('текст увеличен в 200 %: кнопки не обрезаются, язык — в панели', async () => {
      await v.open('/');
      const idle = await page.eval(`(() => {
        const buttons = [...${PANEL}.querySelectorAll('ul[aria-label="Рядом"] button')];
        return {
          rows: new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))).size,
          cut: buttons.flatMap((b) => [...b.querySelectorAll('span.truncate')]).filter((s) => s.scrollWidth > s.clientWidth).map((s) => s.textContent),
          headerLanguage: document.querySelector('.campus-map-header [lang]')?.offsetParent != null,
        };
      })()`);
      assert.equal(idle.rows, 2, 'кнопки «Рядом» — в два ряда');
      assert.deepEqual(idle.cut, [], 'подписи кнопок целиком');
      assert.equal(idle.headerLanguage, false, 'в шапке языка нет');

      await v.click('Развернуть панель');
      assert.ok(await page.eval(`${PANEL}.querySelector('[role="group"]')?.offsetParent != null`), 'язык — в раскрытой панели');

      await v.open('/?from=a1_entrance&to=a3_room305');
      const start = await page.eval(`(() => {
        const button = [...${PANEL}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Начать');
        return button ? { width: button.getBoundingClientRect().width, fits: button.scrollWidth <= button.clientWidth } : null;
      })()`);
      assert.ok(start !== null && start.width >= 150 && start.fits, `«Начать» целиком: ${JSON.stringify(start)}`);
      // Между шапкой и шторкой при увеличенном тексте места мало: кнопки масштаба
      // уступают его, а не уходят под шторку.
      const hidden = await page.eval(`(() => {
        const sheetTop = ${PANEL}.getBoundingClientRect().top;
        return [...document.querySelectorAll('.campus-zoom-controls button, .campus-floor-list')]
          .filter((element) => element.getBoundingClientRect().bottom > sheetTop + 1)
          .map((element) => element.getAttribute('aria-label') ?? element.className);
      })()`);
      assert.deepEqual(hidden, [], 'колонка карты не уходит под шторку');
      const floorList = await page.eval(`document.querySelector('.campus-floor-list')?.getBoundingClientRect().height ?? null`);
      assert.ok(floorList === null || floorList >= 44, `этажи — целыми кнопками, а не обрезком списка: ${floorList}`);

      // Кнопки в столбик — полной высоты, а сводка не ломается рядом с кнопками.
      const overview = await page.eval(`(() => {
        const panel = ${PANEL};
        const start = [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Начать');
        const summary = panel.querySelector('p');
        return {
          startHeight: start ? Math.round(start.getBoundingClientRect().height) : null,
          summaryLines: summary ? Math.round(summary.getBoundingClientRect().height / parseFloat(getComputedStyle(summary).lineHeight)) : null,
        };
      })()`);
      assert.ok(overview.startHeight >= 44, `«Начать» полной высоты: ${JSON.stringify(overview)}`);
      assert.ok(overview.summaryLines !== null && overview.summaryLines <= 2, `сводка маршрута не больше двух строк: ${JSON.stringify(overview)}`);
      await shot('viewer-zoom200');

      await v.open('/?to=b1_canteen');
      const place = await page.eval(`(() => {
        const panel = ${PANEL};
        const heading = panel.querySelector('h2');
        const route = [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Маршрут сюда');
        return {
          headingCut: heading.scrollWidth > heading.clientWidth + 1,
          routeHeight: route ? Math.round(route.getBoundingClientRect().height) : null,
          routeCut: route ? [...route.querySelectorAll('.truncate')].some((s) => s.scrollWidth > s.clientWidth + 1) : null,
        };
      })()`);
      assert.equal(place.headingCut, false, `название места не обрезано: ${JSON.stringify(place)}`);
      assert.ok(place.routeHeight >= 44 && place.routeCut === false, `«Маршрут сюда» целиком и полной высоты: ${JSON.stringify(place)}`);
    });

    await page.viewport(390, 844, 2);

    await step('шапка телефона: «Корпуса» со списком и язык одной кнопкой, между ними — карта', async () => {
      await v.open('/');
      const header = await page.eval(`(() => {
        const header = document.querySelector('.campus-map-header');
        const toggle = header.querySelector('button[lang]');
        const rect = toggle.getBoundingClientRect();
        const middle = header.getBoundingClientRect();
        const gap = document.elementFromPoint(innerWidth / 2 + 40, middle.top + middle.height / 2);
        return {
          labels: [...header.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent.trim()),
          toggle: [Math.round(rect.width), Math.round(rect.height)],
          mapUnderGap: !!gap?.closest('.leaflet-container'),
        };
      })()`);
      assert.deepEqual(header.labels, ['Корпуса', 'English'], `кнопки шапки: ${JSON.stringify(header)}`);
      assert.ok(header.toggle[0] >= 44 && header.toggle[1] >= 44, `кнопка языка: ${header.toggle}`);
      assert.equal(header.mapUnderGap, true, 'между кнопками шапки нажатие достаётся карте');

      await v.click('Корпуса');
      assert.equal(await page.eval(`document.querySelectorAll('.campus-building-menu li').length`), 3, 'в списке три корпуса');
      await page.key('Escape');
      assert.equal(await page.eval(`!document.querySelector('.campus-building-menu') && document.activeElement?.textContent.trim() === 'Корпуса'`), true, 'Escape закрыл список и вернул фокус на кнопку');
      await v.openBuilding('Корпус В');
      await page.waitFor(`document.querySelector('.campus-map-header').innerText.includes('Корпус В')`);
    });

    await step('RU/EN на широком экране: цели нажатия не меньше 44 px', async () => {
      await page.viewport(1024, 768, 1);
      await v.open('/');
      // Размер цели — по тому, куда попадает нажатие, а не по рамке кнопки:
      // область нажатия шире видимой кнопки.
      const sizes = await page.eval(`(() => {
        const group = document.querySelector('.campus-map-header [role="group"]');
        return [...group.querySelectorAll('button')].map((button) => {
          const rect = button.getBoundingClientRect();
          const cx = rect.x + rect.width / 2;
          const cy = rect.y + rect.height / 2;
          const hits = (x, y) => document.elementFromPoint(x, y)?.closest('button') === button;
          let width = 0;
          for (let x = Math.floor(rect.left) - 30; x <= rect.right + 30; x += 1) if (hits(x, cy)) width += 1;
          let height = 0;
          for (let y = Math.floor(rect.top) - 30; y <= rect.bottom + 30; y += 1) if (hits(cx, y)) height += 1;
          return { label: button.getAttribute('aria-label'), width, height };
        });
      })()`);
      assert.equal(sizes.length, 2);
      for (const size of sizes) assert.ok(size.width >= 44 && size.height >= 44, `цель «${size.label}»: ${JSON.stringify(size)}`);
      await page.viewport(390, 844, 2);
    });

    await step('шаг навигации: сколько осталось идти — в шапке первым и целиком', async () => {
      await v.open('/?from=campus_gate&to=a3_room305');
      await v.click('Начать');
      const details = await page.eval(`(() => {
        const span = document.querySelector('.campus-map-header .truncate');
        const text = span?.textContent ?? '';
        const end = text.includes(' · ') ? text.indexOf(' · ') : text.length;
        const range = document.createRange();
        range.setStart(span.firstChild, 0);
        range.setEnd(span.firstChild, end);
        return { text, prefixRight: range.getBoundingClientRect().right, spanRight: span.getBoundingClientRect().right };
      })()`);
      assert.ok(details.text.startsWith('осталось'), `первым — сколько осталось: ${details.text}`);
      assert.ok(details.prefixRight <= details.spanRight + 1, `время видно целиком: ${JSON.stringify(details)}`);
    });

    await step('шторку подняли и опустили жестом — кнопки масштаба над ней', async () => {
      await v.open('/');
      const handle = () => v.center('button[aria-controls="navigator-panel-body"]');
      let [x, y] = await handle();
      await page.dragVertical(x, y, -240);
      await page.waitFor(`!!document.querySelector('button[aria-label="Свернуть панель"]')`);
      await page.sleep(400);
      [x, y] = await handle();
      await page.dragVertical(x, y, 240);
      await page.waitFor(`!!document.querySelector('button[aria-label="Развернуть панель"]')`);
      await page.sleep(600);
      const layout = await page.eval(`(() => {
        const zoom = document.querySelector('.campus-zoom-controls');
        return { zoomBottom: zoom ? zoom.getBoundingClientRect().bottom : null, sheetTop: ${PANEL}.getBoundingClientRect().top };
      })()`);
      assert.ok(layout.zoomBottom !== null && layout.zoomBottom <= layout.sheetTop, `кнопки масштаба над шторкой: ${JSON.stringify(layout)}`);
    });

    await step('раскрытая шторка не прячет маршрут, который был виден', async () => {
      await v.open('/?from=campus_gate&to=a3_room305');
      await page.sleep(900);
      await v.click('Развернуть панель');
      // Карта подгоняется после того, как шторка встанет на место; под нагрузкой
      // это дольше — ждётся итог, а не фиксированная пауза.
      const routeAboveSheet = `(() => {
        const top = document.querySelector('.campus-map-header').getBoundingClientRect().bottom;
        const bottom = ${PANEL}.getBoundingClientRect().top;
        return [...document.querySelectorAll('.campus-route-line')].some((line) => {
          const rect = line.getBoundingClientRect();
          return rect.bottom > top && rect.top < bottom;
        });
      })()`;
      let visible = false;
      for (const deadline = Date.now() + 4000; !visible && Date.now() < deadline; await page.sleep(200)) {
        visible = await page.eval(routeAboveSheet);
      }
      if (!visible) {
        // Где линии, шапка и шторка: без этого непонятно, не подогналась ли карта или линия под шторкой.
        const state = await page.eval(`({
          header: document.querySelector('.campus-map-header').getBoundingClientRect().bottom,
          panel: ${PANEL}.getBoundingClientRect().top,
          lines: [...document.querySelectorAll('.campus-route-line, .campus-route-ghost')].map((line) => ({ cls: line.getAttribute('class'), rect: line.getBoundingClientRect().toJSON() })),
          pane: document.querySelector('.leaflet-map-pane')?.style.transform ?? null,
        })`);
        assert.fail(`линия маршрута над раскрытой шторкой; состояние: ${JSON.stringify(state)}`);
      }
      await shot('viewer-expanded-route');
    });
  },
};
