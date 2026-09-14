/**
 * Помощники сценариев навигатора: открыть адрес, найти панель, нажать кнопку
 * по подписи, набрать запрос в поиске.
 *
 * Элементы ищутся по доступным именам — `aria-label` и видимому тексту, — а
 * не по классам разметки: так сценарий проверяет то, что видит и слышит
 * человек, и не ломается от перестановки классов. Цена — переименование строки
 * интерфейса требует правки сценария.
 */

/** Панель навигатора на любом языке интерфейса. */
export const PANEL = `document.querySelector('section[aria-label="Панель навигатора"], section[aria-label="Navigator panel"]')`;

/** Окно поиска. */
export const SEARCH = `document.querySelector('[data-search-view]')`;

/**
 * @param {Awaited<ReturnType<import('./cdp.mjs').openPage>>} page
 * @param {string} base адрес приложения без завершающего слэша
 */
export function viewerHelpers(page, base) {
  let onboardingSkipped = false;

  const helpers = {
    /**
     * Открывает путь приложения и ждёт загрузки данных — шапки и панели.
     *
     * По умолчанию — с отметкой «знакомство пройдено»: диалог первого запуска
     * закрывал бы то, что проверяют остальные сценарии. Сценарий знакомства
     * передаёт `{ onboarding: true }`.
     */
    async open(pathAndQuery = '/', { onboarding = false } = {}) {
      if (!onboarding && !onboardingSkipped) {
        await page.send('Page.addScriptToEvaluateOnNewDocument', {
          source: "try { localStorage.setItem('campus-map:onboarding-done', '1'); } catch {}",
        });
        onboardingSkipped = true;
      }
      await page.goto(`${base}${pathAndQuery}`);
      await page.waitFor(`!!document.querySelector('.campus-map-header') && !!${PANEL}`, 20_000);
      await page.sleep(600);
    },

    // textContent, а не innerText: innerText применяет CSS `uppercase`, и
    // заголовки разделов читались бы заглавными.
    panelText: () => page.eval(`${PANEL}?.textContent ?? ''`),
    heading: () => page.eval(`${PANEL}?.querySelector('h2')?.textContent ?? ''`),
    headerText: () => page.eval(`document.querySelector('.campus-map-header')?.innerText ?? ''`),
    searchOpen: () => page.eval(`!!${SEARCH}`),
    href: () => page.eval('location.href'),

    /**
     * Нажимает кнопку по подписи: сначала точное совпадение `aria-label` или
     * текста, затем вхождение текста.
     *
     * @param root выражение контейнера в странице; по умолчанию весь документ
     */
    async click(label, root = 'document') {
      const clicked = await page.eval(`(() => {
        const label = ${JSON.stringify(label)};
        const buttons = [...${root}.querySelectorAll('button')].filter((b) => !b.disabled);
        const button =
          buttons.find((b) => b.getAttribute('aria-label') === label || b.textContent.trim() === label) ??
          buttons.find((b) => b.textContent.includes(label));
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (!clicked) throw new Error(`нет кнопки «${label}»`);
      await page.sleep(450);
    },

    /** Набирает запрос в открытом поиске и ждёт подсказок. */
    async typeSearch(query) {
      await page.waitFor(`!!${SEARCH} && document.activeElement?.getAttribute('role') === 'combobox'`);
      await page.eval(`(() => {
        const input = document.activeElement;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(query)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await page.waitFor(`document.querySelectorAll('[role="option"]').length > 0`);
      await page.sleep(200);
    },

    /** Строки подсказок: имя, совпавшее имя (если есть), положение. */
    options: () => page.eval(`[...document.querySelectorAll('[role="option"]')].map((o) => o.innerText.split('\\n'))`),

    /** Выбирает подсказку по первой строке. */
    async chooseOption(name) {
      const chosen = await page.eval(`(() => {
        const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.innerText.split('\\n')[0] === ${JSON.stringify(name)});
        if (!option) return false;
        option.click();
        return true;
      })()`);
      if (!chosen) throw new Error(`нет подсказки «${name}»`);
      await page.sleep(600);
    },

    /** Центр элемента в окне; `null`, если элемента нет. */
    center: (selector) =>
      page.eval(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return [rect.x + rect.width / 2, rect.y + rect.height / 2];
      })()`),

    /**
     * Во сколько ширин окна растянут план — признак приближения до предела. На
     * холсте кампуса — самый широкий из видимых планов этажей.
     */
    planWidthInScreens: () =>
      page.eval(`(() => {
        const plans = [...document.querySelectorAll('.campus-placed-plan[data-plan="floor"][data-visible="true"], .leaflet-image-layer')];
        return plans.length > 0 ? Math.max(...plans.map((plan) => plan.getBoundingClientRect().width)) / innerWidth : null;
      })()`),

    /** Сколько линий маршрута приглушено и сколько нет. */
    routeLines: () =>
      page.eval(`({
        muted: document.querySelectorAll('.campus-route-line--muted').length,
        strong: document.querySelectorAll('.campus-route-line:not(.campus-route-line--muted)').length,
      })`),
  };

  return helpers;
}
