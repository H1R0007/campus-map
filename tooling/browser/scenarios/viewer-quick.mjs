import { strict as assert } from 'node:assert';
import { PANEL, SEARCH, viewerHelpers } from '../viewer.mjs';

/**
 * Навигатор: быстрые кнопки к ближайшему месту и поиск разговорными словами
 * (записи 19, 20 и 22).
 *
 * Написан под тестовый `data/`: туалеты на 1 и 2 этажах корпуса А и на 1 этаже
 * корпуса Б, столовые в корпусах А и Б, гардероб в корпусе А, выходы — входы
 * корпусов и проходная. Данные метрические, поэтому подсказка на кнопке — время
 * в пути («~1 мин»); подсказку «где» без метрики проверяют модульные тесты.
 */
export default {
  app: 'viewer',
  name: 'навигатор: быстрые кнопки и разговорный поиск',

  async run({ page, base, step, shot }) {
    const v = viewerHelpers(page, base);
    await page.viewport(390, 844, 2);

    const quickLabels = (root = PANEL) =>
      page.eval(`[...(${root}?.querySelectorAll('ul[aria-label="Рядом"] button') ?? [])].map((b) => b.getAttribute('aria-label'))`);
    const routeShown = () => page.waitFor(`${PANEL}.textContent.includes('Маршрут ·')`);

    await step('без «вы здесь» кнопка спрашивает, где вы, и ведёт к ближайшему', async () => {
      await v.open('/');
      // Без заданной точки свёрнутая шторка — только поиск: быстрые кнопки — в
      // поиске и в раскрытой шторке (запись 37).
      // Названия видов — из каталога в данных (запись 44); выход — двери корпусов.
      const all = ['Туалет — ближайшее место', 'Столовая — ближайшее место', 'Гардероб — ближайшее место', 'Ближайший выход'];
      assert.deepEqual(await quickLabels(), [], 'в свёрнутой шторке кнопок нет');
      await v.click('Развернуть панель');
      assert.deepEqual(await quickLabels(), all, 'кнопки в раскрытой шторке');
      await v.click('Свернуть панель');

      await v.click('Найти аудиторию или место');
      await page.waitFor(`!!${SEARCH}`);
      assert.deepEqual(await quickLabels(SEARCH), all, 'кнопки в поиске');
      await shot('viewer-quick-idle');

      await v.click('Туалет — ближайшее место');
      await page.waitFor(`!!${SEARCH}`);
      assert.equal(await page.eval('document.activeElement?.placeholder'), 'Аудитория или место рядом с вами');
      assert.ok((await page.eval(`${SEARCH}.textContent`)).includes('Где вы сейчас?'));

      // Из деканата ближайший туалет — на том же, втором этаже, а не лифтом
      // на первом.
      await v.typeSearch('деканат');
      await v.chooseOption('Деканат');
      await routeShown();
      assert.equal(await v.heading(), 'Туалет, 2 этаж корпуса А');
      const url = new URL(await v.href());
      assert.equal(url.searchParams.get('from'), 'a2_dean');
      assert.equal(url.searchParams.get('to'), 'a2_toilet');
    });

    await step('QR у входа: время до места и маршрут без поиска', async () => {
      await v.open('/?at=a1_entrance');
      const [toilet] = await quickLabels();
      assert.match(toilet, /^Туалет — ближайшее место, ~\d+\sмин$/);
      await shot('viewer-quick-qr');

      await v.click(toilet);
      await routeShown();
      assert.equal(new URL(await v.href()).searchParams.get('to'), 'a1_toilet');
      assert.equal(await v.searchOpen(), false);
    });

    await step('выход с третьего этажа — к входу корпуса на первом', async () => {
      await v.open('/?at=a3_room305');
      const exit = (await quickLabels()).find((label) => label.startsWith('Ближайший выход'));
      assert.match(exit, /^Ближайший выход, ~\d+\sмин$/);

      await v.click(exit);
      await routeShown();
      assert.match(new URL(await v.href()).searchParams.get('to') ?? '', /^a1_entrance/);
    });

    await step('все места вида: список в шторке и отметки на карте, выбор другого — маршрут туда', async () => {
      // Владелец: человек не всегда хочет в ближайшую столовую — показать все
      // сразу, и выбрать можно прямо с карты (запись 45).
      await v.open('/?at=a1_entrance');
      const [toilet] = await quickLabels();
      await v.click(toilet);
      await routeShown();
      const to = async () => new URL(await v.href()).searchParams.get('to');
      assert.equal(await to(), 'a1_toilet', 'быстрая кнопка должна вести к ближайшему');

      // Свёрнутая шторка: кнопка списка всех мест вида.
      const panelText = () => page.eval(`${PANEL}.textContent`);
      assert.ok((await panelText()).includes('Туалет: все места (3)'), 'нет кнопки «Туалет: все места»');

      // Карта: на втором этаже — отметка второго туалета, нажатие ведёт туда.
      await v.click('Этаж 2');
      await page.sleep(600);
      const markers = () =>
        page.eval(`[...document.querySelectorAll('.campus-marker--kind')].map((m) => m.getAttribute('title'))`);
      const onFloor = await markers();
      // Виден и соседний корпус: его туалет тоже отмечен. Выбранного сейчас
      // места среди отметок нет — оно отмечено концом маршрута.
      assert.ok(onFloor.includes('Туалет, 2 этаж корпуса А — проложить маршрут сюда'), `отметки: ${JSON.stringify(onFloor)}`);
      assert.ok(!onFloor.some((title) => title.startsWith('Туалет, 1 этаж корпуса А')), 'выбранное место отмечено ещё раз');
      await shot('viewer-quick-kind-map');
      await page.eval(`[...document.querySelectorAll('.campus-marker--kind')].find((m) => m.getAttribute('title').startsWith('Туалет, 2 этаж')).click()`);
      await page.sleep(600);
      assert.equal(await to(), 'a2_toilet', 'нажатие на отметку не повело туда');

      // Список: все три туалета, выбранный отмечен; выбор из списка — маршрут туда.
      await v.click('Туалет: все места (3)');
      await page.sleep(400);
      const items = await page.eval(`[...document.querySelectorAll('[aria-labelledby="kind-places-title"] li button')].map((b) => ({
        text: b.textContent.trim(),
        current: b.getAttribute('aria-current'),
      }))`);
      assert.equal(items.length, 3, `в списке: ${JSON.stringify(items)}`);
      assert.ok(items.find((item) => item.current === 'true')?.text.includes('2 этаж корпуса А'), 'в списке не отмечено выбранное место');
      await shot('viewer-quick-kind-list');

      await page.eval(`[...document.querySelectorAll('[aria-labelledby="kind-places-title"] li button')].find((b) => b.textContent.includes('корпуса Б')).click()`);
      await page.sleep(600);
      assert.equal(await to(), 'b1_toilet', 'выбор из списка не повёл туда');
      assert.ok((await panelText()).includes('Туалет: все места'), 'после выбора другого туалета список пропал');
    });

    await step('когда цель уже задана, быстрых кнопок нет', async () => {
      await v.open('/?to=a3_room305');
      await page.eval(`${PANEL}.querySelector('h2').focus()`);
      await page.key('Escape');
      assert.ok((await v.panelText()).includes('Откуда начать маршрут?'));
      assert.deepEqual(await quickLabels(), []);
    });

    await step('поиск: разговорное слово и слитный номер', async () => {
      await v.open('/');
      await v.click('Найти аудиторию или место');
      await v.typeSearch('поесть');
      assert.deepEqual((await v.options()).map((lines) => lines[0]), ['Столовая', 'Столовая']);

      await v.typeSearch('А305');
      await page.waitFor(`document.querySelector('[role="option"]')?.innerText.startsWith('А-305')`);
      await v.chooseOption('А-305');
      assert.equal(await v.heading(), 'А-305');
    });
  },
};
