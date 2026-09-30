import { strict as assert } from 'node:assert';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: окна карт (запись 66).
 *
 * Открытые планы — вкладками над картой, как в браузере: щелчок в дереве
 * открывает план в той же вкладке, Ctrl+щелчок — в новой; переключение
 * возвращает место, масштаб и выбор. «Открыть рядом» — вторая карта со своими
 * вкладками; щелчок делает карту активной, переход строится с двух карт, между
 * концами — пунктир. Вторую карту сворачивают в полоску, не закрывая.
 */
export default {
  app: 'editor',
  name: 'редактор: окна карт',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);

    /** Вкладки карты `group` (0 или 1): названия, у открытой — звёздочка. */
    const tabs = (group = 0) =>
      page.eval(`(() => {
        const section = document.querySelectorAll('.editor-mapgroup')[${group}];
        return section ? [...section.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim() + (tab.getAttribute('aria-selected') === 'true' ? '*' : '')) : null;
      })()`);
    const groups = () => page.eval(`document.querySelectorAll('.editor-mapgroup').length`);
    const activeGroup = () =>
      page.eval(`[...document.querySelectorAll('.editor-mapgroup')].findIndex((section) => section.classList.contains('editor-mapgroup--active'))`);
    const clickTab = async (group, title) => {
      const point = await page.eval(`(() => {
        const section = document.querySelectorAll('.editor-mapgroup')[${group}];
        const tab = [...section.querySelectorAll('[role="tab"]')].find((item) => item.textContent.trim() === ${JSON.stringify(title)});
        if (!tab) return null;
        const r = tab.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      assert.ok(point, `нет вкладки «${title}»`);
      await e.click(point.x, point.y);
      await page.sleep(300);
    };
    /** Центр узла на карте `group` — у каждой карты свои узлы. */
    const nodeIn = async (group, id) => {
      const point = await page.eval(`(() => {
        const section = document.querySelectorAll('.editor-mapgroup')[${group}];
        const path = section?.querySelector('path[data-node-id=${JSON.stringify(id)}]');
        if (!path) return null;
        const r = path.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        return { x, y, top: document.elementFromPoint(x, y) === path };
      })()`);
      assert.ok(point, `узла ${id} нет на карте ${group + 1}`);
      assert.ok(point.top, `узел ${id} на карте ${group + 1} закрыт`);
      return point;
    };
    /** Ctrl+щелчок по плану в дереве — новая вкладка. */
    const treeInNewTab = async (label) => {
      const point = await page.eval(`(() => {
        const item = [...document.querySelectorAll('.editor-tree__item')].find((b) => b.querySelector('.editor-tree__label')?.textContent.trim() === ${JSON.stringify(label)});
        if (!item) return null;
        const r = item.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      assert.ok(point, `в дереве нет «${label}»`);
      await e.click(point.x, point.y, { modifiers: MOD.ctrl });
      await page.sleep(300);
    };
    const links = () => page.eval(`Number(document.querySelector('svg.editor-crosslink')?.dataset.links ?? 0)`);

    await step('план из дерева — в той же вкладке, Ctrl+щелчок — в новой; вернулись — место и выбор те же', async () => {
      await e.open();
      assert.deepEqual(await tabs(), ['Территория*']);
      await e.openFloor('Корпус А', 1);
      assert.deepEqual(await tabs(), ['Корпус А · 1*'], 'дерево открыло новую вкладку без просьбы');

      const room = await e.nodePoint('a1_room101');
      await e.click(room.x, room.y);
      assert.equal(await e.propertiesNodeId(), 'a1_room101');
      const free = await e.emptyMapPoint();
      await e.drag(free.x, free.y, free.x - 140, free.y - 60);
      const before = await e.nodePoint('a1_hall');

      await treeInNewTab('Этаж 2');
      assert.deepEqual(await tabs(), ['Корпус А · 1', 'Корпус А · 2*']);
      assert.equal(await e.selectedCount(), 0, 'выбор перешёл на другой этаж');

      await clickTab(0, 'Корпус А · 1');
      const after = await e.nodePoint('a1_hall');
      assert.ok(Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2, 'вкладка открылась не там, где её оставили');
      assert.equal(await e.propertiesNodeId(), 'a1_room101', 'выбор вкладки не вернулся');
      await shot('editor-windows-tabs');
    });

    await step('строка пути меняет план вкладки; открытый в другой вкладке — открывает её', async () => {
      await page.eval(`(() => {
        const select = document.querySelector('.editor-mapgroup select[aria-label="Этаж"]');
        select.value = '2';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await page.sleep(400);
      assert.deepEqual(await tabs(), ['Корпус А · 1', 'Корпус А · 2*'], 'появилась вторая вкладка того же этажа');
    });

    await step('вкладки: стрелки переключают, крестик и средняя кнопка закрывают', async () => {
      await page.eval(`document.querySelector('.editor-mapgroup [role="tab"][aria-selected="true"]').focus()`);
      await e.key('ArrowLeft');
      assert.deepEqual(await tabs(), ['Корпус А · 1*', 'Корпус А · 2']);
      assert.equal(await page.eval(`document.activeElement?.getAttribute('role')`), 'tab', 'фокус ушёл с вкладок');

      // Меню правой кнопки в дереве — тот же выбор словами.
      const territory = await page.eval(`(() => {
        const item = [...document.querySelectorAll('.editor-tree__item')].find((b) => b.querySelector('.editor-tree__label')?.textContent.trim() === 'Территория');
        const r = item.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      await e.click(territory.x, territory.y, { button: 'right' });
      assert.deepEqual((await e.menus())[0]?.items, ['Открыть', 'Открыть в новой вкладкеCtrl+щелчок', 'Открыть рядом']);
      await e.menuPick('Открыть в новой вкладке');
      assert.deepEqual(await tabs(), ['Корпус А · 1', 'Территория*', 'Корпус А · 2']);
      await e.press('Закрыть вкладку «Территория»');
      assert.deepEqual(await tabs(), ['Корпус А · 1', 'Корпус А · 2*']);
      await clickTab(0, 'Корпус А · 1');

      const middle = await page.eval(`(() => {
        const tab = [...document.querySelectorAll('.editor-mapgroup [role="tab"]')].find((t) => t.textContent.trim() === 'Корпус А · 2');
        const r = tab.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      await e.click(middle.x, middle.y, { button: 'middle' });
      assert.deepEqual(await tabs(), ['Корпус А · 1*']);
      assert.equal(await page.eval(`document.querySelectorAll('.editor-maptab__close').length`), 0, 'последнюю вкладку можно закрыть');
    });

    await step('«Открыть рядом»: вторая карта с этажом выше, щелчок делает карту активной', async () => {
      await e.press('Открыть рядом');
      assert.equal(await groups(), 2);
      assert.deepEqual(await tabs(1), ['Корпус А · 2*']);
      assert.equal(await activeGroup(), 1, 'работа не перешла на новую карту');
      await page.waitFor(`document.querySelectorAll('.editor-mapgroup')[1].querySelectorAll('path[data-node-id]').length > 0`);

      const room = await nodeIn(0, 'a1_room101');
      await e.click(room.x, room.y);
      assert.equal(await activeGroup(), 0, 'щелчок не сделал карту активной');
      assert.equal(await e.propertiesNodeId(), 'a1_room101', 'щелчок по неактивной карте не выбрал точку');

      const corridor = await nodeIn(1, 'a2_room202');
      await e.click(corridor.x, corridor.y);
      assert.equal(await activeGroup(), 1);
      assert.equal(await e.propertiesNodeId(), 'a2_room202');
      // Клавиши — активной карте: Escape снимает выбор у неё, соседняя свой помнит.
      await e.key('Escape');
      assert.equal(await e.selectedCount(), 0);
      // Стрелка без выбора двигает только активную карту.
      const left = await nodeIn(0, 'a1_room101');
      const right = await nodeIn(1, 'a2_room202');
      await e.key('ArrowRight');
      const leftAfter = await nodeIn(0, 'a1_room101');
      const rightAfter = await nodeIn(1, 'a2_room202');
      assert.ok(Math.abs(leftAfter.x - left.x) < 1, 'стрелка сдвинула неактивную карту');
      assert.ok(Math.abs(rightAfter.x - right.x) > 50, 'стрелка не сдвинула активную карту');
      await e.key('ArrowLeft');
      await clickTab(0, 'Корпус А · 1');
      assert.equal(await activeGroup(), 0);
      assert.equal(await e.propertiesNodeId(), 'a1_room101', 'выбор первой карты потерялся');
      await shot('editor-windows-split');
    });

    await step('переход с двух карт: пунктир от первой точки к курсору, затем к концу перехода', async () => {
      await e.mode('Разметка');
      await e.key('t', { code: 'KeyT' });
      // Лестница: её второй конец — этаж выше, он и открыт на соседней карте.
      await e.press('Лестница');
      const start = await nodeIn(0, 'a1_room101');
      await e.click(start.x, start.y);
      const target = await nodeIn(1, 'a2_room201');
      await e.mouse('mouseMoved', target.x - 40, target.y - 30);
      await page.sleep(200);
      assert.equal(await links(), 1, 'нет пунктира от первой точки к курсору');
      await shot('editor-windows-link-pending');

      await e.click(target.x, target.y);
      assert.match(await e.notice(), /Лестница: «А-101» — «А-201»/, 'переход не создан');
      assert.match(await e.status(), /Правок: 1/);

      await e.key('v', { code: 'KeyV' });
      const again = await nodeIn(0, 'a1_room101');
      await e.click(again.x, again.y);
      assert.equal(await links(), 1, 'нет пунктира к концу перехода на соседней карте');
      await shot('editor-windows-link');
    });

    await step('вторая карта сворачивается в полоску и разворачивается, не теряя вкладок', async () => {
      await e.press('Свернуть');
      assert.equal(await groups(), 1);
      assert.ok(await e.rect('.editor-mapstrip'), 'нет полоски свёрнутой карты');
      assert.equal(await activeGroup(), 0);
      await shot('editor-windows-collapsed');

      await e.press('Развернуть карту: Корпус А · 2');
      assert.equal(await groups(), 2);
      assert.deepEqual(await tabs(1), ['Корпус А · 2*']);
      assert.equal(await activeGroup(), 1);
    });

    await step('граница между картами тянется, двойной щелчок — поровну', async () => {
      const width = () => page.eval(`document.querySelectorAll('.editor-mapgroup')[0].getBoundingClientRect().width`);
      const equal = await width();
      const bar = await e.rect('.editor-splitter');
      await e.drag(bar.left + 3, bar.top + 200, bar.left + 3 - 200, bar.top + 200);
      assert.ok(Math.abs((await width()) - (equal - 200)) < 4, 'граница не сдвинулась');
      await e.dblclick(bar.left + 3 - 200, bar.top + 200);
      assert.ok(Math.abs((await width()) - equal) < 4, 'двойной щелчок не вернул поровну');
    });

    await step('вкладку переносят на другую карту перетаскиванием', async () => {
      await treeInNewTab('Этаж 1');
      // Карта 2 активна: «Этаж 1» открылся новой вкладкой у неё.
      assert.deepEqual(await tabs(1), ['Корпус А · 2', 'Корпус А · 1*']);
      await page.eval(`(() => {
        const data = new DataTransfer();
        const tab = [...document.querySelectorAll('.editor-mapgroup')[1].querySelectorAll('.editor-maptab')]
          .find((item) => item.textContent.trim() === 'Корпус А · 2');
        tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
      })()`);
      await page.sleep(200);
      assert.ok(await e.rect('.editor-dropzone'), 'нет зоны «Перенести на эту карту»');
      await page.eval(`(() => {
        const data = new DataTransfer();
        const zone = document.querySelector('.editor-dropzone');
        zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
        zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
      })()`);
      await page.sleep(300);
      assert.deepEqual(await tabs(0), ['Корпус А · 1', 'Корпус А · 2*']);
      assert.deepEqual(await tabs(1), ['Корпус А · 1*']);
      assert.equal(await activeGroup(), 0);
    });

    await step('закрыли вторую карту — остаётся первая', async () => {
      await e.press('Закрыть карту');
      assert.equal(await groups(), 1);
      assert.deepEqual(await tabs(0), ['Корпус А · 1', 'Корпус А · 2*']);
      assert.equal(await page.eval(`document.querySelectorAll('.editor-mapstrip').length`), 0);
    });

    await step('«Переход отсюда…» в карточке открывает второй конец на соседней карте', async () => {
      await clickTab(0, 'Корпус А · 1');
      const room = await nodeIn(0, 'a1_room102');
      await e.click(room.x, room.y);
      await e.press('Переход отсюда…');
      await e.press('Лестница');
      assert.equal(await groups(), 2, 'соседняя карта не открылась');
      assert.deepEqual(await tabs(1), ['Корпус А · 2*']);
      assert.equal(await activeGroup(), 0, 'работа ушла с карты, где начали переход');
      assert.match(await e.notice(), /соседней карте — там «Корпус А · 2»/);
      await page.waitFor(`document.querySelectorAll('.editor-mapgroup')[1].querySelectorAll('path[data-node-id]').length > 0`);

      const target = await nodeIn(1, 'a2_room202');
      await e.click(target.x, target.y);
      assert.match(await e.notice(), /Лестница: «А-102» — «/, 'переход не создан');
      await shot('editor-windows-from-card');
    });

    /** Окно лежит поверх всего: в его углах и в середине — оно само, а не карта рядом. */
    const dialogOnTop = () =>
      page.eval(`(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return 'окна нет';
        const r = dialog.getBoundingClientRect();
        const points = [[r.left + 10, r.top + 10], [r.right - 10, r.top + 10], [r.left + 10, r.bottom - 10], [r.right - 10, r.bottom - 10], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]];
        const covered = points.filter(([x, y]) => !dialog.contains(document.elementFromPoint(x, y)));
        return covered.length === 0 ? 'поверх' : 'закрыто в ' + covered.length + ' точках';
      })()`);

    await step('окна поверх обеих карт: новый корпус, этаж вручную, справка (запись 68)', async () => {
      assert.equal(await groups(), 2);
      // Работаем на левой карте: окно из неё раньше пряталось под правую.
      await clickTab(0, 'Корпус А · 1');
      await e.press('Новый корпус');
      assert.equal(await dialogOnTop(), 'поверх', 'окно «Новый корпус» закрыто картой');
      await e.press('Создать');
      await page.waitFor(`!document.querySelector('[role="dialog"]')`);
      const opened = `${(await tabs(0)).join()} | ${(await tabs(1)).join()} | активна ${await activeGroup()}`;
      assert.match(opened, /^[^|]*Корпус Г\*/, `новый корпус открылся не в текущей вкладке: ${opened}`);

      // У корпуса без этажей кнопка — внутри карты; окно — всё равно поверх обеих карт.
      await e.press('Добавить этаж вручную…');
      assert.equal(await dialogOnTop(), 'поверх', 'окно «Новый этаж» закрыто второй картой');
      await shot('editor-windows-dialog');

      // Щелчок по тексту окна не уводит клавиатуру на карту: иначе Delete
      // удалил бы точку за открытым окном.
      const title = await e.rect('[role="dialog"] .editor-dialog__title');
      await e.click(title.left + 20, title.top + title.height / 2);
      assert.equal(await page.eval(`!!document.activeElement?.closest('.leaflet-container')`), false, 'щелчок в окне отдал клавиатуру карте');

      // Поле окна принимает ввод.
      const field = await e.rect('input[aria-label="Подпись этажа"]');
      await e.click(field.left + field.width / 2, field.top + field.height / 2);
      assert.equal(await page.eval(`document.activeElement?.getAttribute('aria-label')`), 'Подпись этажа', 'щелчок в окне отдал клавиатуру карте');
      await e.type('Ц');
      await e.toggleFilter('Без плана — добавить позже');
      await e.press('Создать');
      await page.waitFor(`!document.querySelector('[role="dialog"]')`);
      assert.match((await tabs(0)).join(), /Корпус Г · Ц\*/, 'этаж не создан');

      await e.key('F1', { keyCode: 112 });
      assert.equal(await dialogOnTop(), 'поверх', 'справка закрыта картой');
      await e.key('Escape', { keyCode: 27 });
    });
  },
};
