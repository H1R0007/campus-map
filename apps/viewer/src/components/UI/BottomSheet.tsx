import React, { useCallback, useEffect, useRef, useState } from 'react';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { useRouteStore, type RouteField } from '../../stores/routeStore';
import { messagesFor, useLanguage } from '../../i18n';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { scopeLabel } from '../../utils/placeLabels';
import { routeSummary } from '../../utils/routeSummary';
import { browserShareEnvironment, shareLink } from '../../utils/shareLink';
import { PlaceCard } from './PlaceCard';
import { RouteFields } from './RouteFields';
import { RouteOptions } from './RouteOptions';
import { RouteSteps } from './RouteSteps';
import { ShareFeedback } from './ShareFeedback';

/**
 * Нижняя панель навигатора.
 *
 * Свёрнутой показывает одно из трёх, по важности: карточку места, выбранного
 * на карте; готовый маршрут со сводкой; приглашение к поиску. Развёрнутой —
 * модальный диалог с полями (`RouteFields`), ограничениями (`RouteOptions`) и
 * шагами маршрута (`RouteSteps`).
 */

/**
 * Место свёрнутой карточки: над системной полосой iPhone, на широком экране —
 * у левого края, чтобы не закрывать середину карты с маршрутом. Высота
 * карточки учтена в `MAP_CHROME_INSETS`.
 */
const COLLAPSED_POSITION =
  'fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-3 right-3 md:left-4 md:right-auto md:w-96 z-[1000]';

const SHEET_TITLE_ID = 'route-sheet-title';

/** Сколько видно подтверждение «Ссылка скопирована», мс. */
const LINK_COPIED_MS = 2500;

export const BottomSheet: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeInput, setActiveInput] = useState<RouteField | null>(null);
  // Время копирования, а не флаг: повторное копирование заново заводит таймер
  // подтверждения.
  const [linkCopiedAt, setLinkCopiedAt] = useState<number | null>(null);
  // Ссылка, которую не удалось скопировать, — для окна ручного копирования.
  const [manualLink, setManualLink] = useState<string | null>(null);

  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const collapsedActionRef = useRef<HTMLButtonElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  const fromQuery = useRouteStore((s) => s.fromQuery);
  const toQuery = useRouteStore((s) => s.toQuery);
  const fromNodeId = useRouteStore((s) => s.fromNodeId);
  const toNodeId = useRouteStore((s) => s.toNodeId);
  const currentRoute = useRouteStore((s) => s.currentRoute);
  const options = useRouteStore((s) => s.options);
  const setPoint = useRouteStore((s) => s.setPoint);
  const setOptions = useRouteStore((s) => s.setOptions);
  const buildRoute = useRouteStore((s) => s.buildRoute);
  const clearRoute = useRouteStore((s) => s.clearRoute);

  const graph = useMapStore((s) => s.graph);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const activeFloor = useMapStore((s) => s.activeFloor);
  const selectedNodeId = useMapStore((s) => s.selectedNodeId);

  const language = useLanguage();
  const messages = messagesFor(language);

  const close = () => {
    restoreFocus.current = true;
    setIsExpanded(false);
    setActiveInput(null);
  };

  useDialogFocus(sheetRef, isExpanded, close);

  // Фокус на поле, которое пользователь только что выбрал.
  useEffect(() => {
    if (!isExpanded) return;
    if (activeInput === 'from') fromInputRef.current?.focus();
    if (activeInput === 'to') toInputRef.current?.focus();
  }, [isExpanded, activeInput]);

  // Кнопка, которой шторку открыли, при разворачивании исчезла из разметки.
  // После закрытия фокус возвращается на ту, что появилась вместо неё, —
  // иначе клавиатура и экранный диктор начинали бы снова с начала страницы.
  useEffect(() => {
    if (isExpanded || !restoreFocus.current) return;
    restoreFocus.current = false;
    collapsedActionRef.current?.focus();
  }, [isExpanded]);

  // Подтверждение копирования гаснет само: действие уже выполнено, и закрывать
  // сообщение незачем.
  useEffect(() => {
    if (linkCopiedAt === null) return;
    const timer = setTimeout(() => setLinkCopiedAt(null), LINK_COPIED_MS);
    return () => clearTimeout(timer);
  }, [linkCopiedAt]);

  // Высота свёрнутой карточки — в CSS-переменную: колонка этажей и масштаба
  // заканчивается над карточкой, а карточка места выше поисковой.
  const sheetObserver = useRef<ResizeObserver | null>(null);
  const measureCollapsed = useCallback((element: HTMLDivElement | null) => {
    sheetObserver.current?.disconnect();
    sheetObserver.current = null;
    if (element === null) return;

    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty(
        '--campus-sheet-height',
        `${Math.round(entry.contentRect.height)}px`
      );
    });
    observer.observe(element);
    sheetObserver.current = observer;
  }, []);

  const currentScopeLabel = buildingMetas ? scopeLabel(scopeOf(activeFloor), buildingMetas, language) : '';
  const canBuild = fromNodeId !== null && toNodeId !== null;

  /** Открывает шторку на поле, которое осталось заполнить. */
  const openSheet = (field: RouteField | null) => {
    setIsExpanded(true);
    setActiveInput(field);
  };

  /**
   * Делится маршрутом: системным окном, где его нет — копированием адреса, а
   * если недоступно и копирование — окном со ссылкой для ручного копирования.
   *
   * Адрес уже описывает маршрут: его концы в адресной строке держит
   * `useRouteLink`, и получатель ссылки увидит тот же маршрут.
   */
  const shareRoute = async () => {
    const url = window.location.href;
    const outcome = await shareLink(url, messages.route.title, browserShareEnvironment());

    if (outcome === 'copied') setLinkCopiedAt(Date.now());
    if (outcome === 'manual') setManualLink(url);
  };

  const closeManualLink = () => {
    setManualLink(null);
    // Окно открыла кнопка «Поделиться» — фокус возвращается на неё.
    shareButtonRef.current?.focus();
  };

  /** Итог «Поделиться» виден в любом состоянии шторки. */
  const withShareFeedback = (content: React.ReactNode) => (
    <>
      {/* Первым в разметке: при смене вида шторки React сохраняет область
          `aria-live`, и объявление не теряется. */}
      <ShareFeedback copied={linkCopiedAt !== null} manualLink={manualLink} onCloseManual={closeManualLink} />
      {content}
    </>
  );

  /** Точка выбрана подсказкой или среди одноимённых мест. */
  const handlePointChosen = (field: RouteField, nodeId: string) => {
    const route = setPoint(field, nodeId);

    // Вторая точка выбрана и маршрут построен — шторка уступает место карте с
    // линией. Если построить не удалось, шторка остаётся открытой с причиной.
    if (route?.found) {
      close();
      return;
    }

    // Второй точки ещё нет — фокус на её поле: это следующий шаг сценария.
    if (route === null) {
      const other: RouteField = field === 'from' ? 'to' : 'from';
      setActiveInput(other);
      setTimeout(() => (other === 'to' ? toInputRef : fromInputRef).current?.focus(), 0);
    }
  };

  if (!isExpanded) {
    // Выбранное на карте место важнее показанного маршрута: человек только что
    // нажал на план и ждёт ответа именно на это.
    if (selectedNodeId !== null) {
      return withShareFeedback(
        <div ref={measureCollapsed} className={COLLAPSED_POSITION}>
          <PlaceCard nodeId={selectedNodeId} onOpenSheet={openSheet} />
        </div>
      );
    }

    if (graph && currentRoute?.found) {
      return withShareFeedback(
        <div ref={measureCollapsed} className={COLLAPSED_POSITION}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-start flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold" aria-hidden="true">✓</span>
              </div>

              <div className="flex-1 min-w-0">
                {/* Сводка: время и длина в метрическом режиме, корпуса и этажи — в пиксельном. */}
                <div className="text-sm font-semibold text-gray-800 truncate">
                  {messages.route.ready} · {routeSummary(graph, currentRoute, language)}
                </div>
                <div className="text-xs text-gray-600 truncate">{`${fromQuery} → ${toQuery}`}</div>
              </div>

              <button
                ref={collapsedActionRef}
                type="button"
                onClick={() => openSheet(null)}
                className="px-3 py-2 rounded-xl text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                {messages.route.showSteps}
              </button>

              <button
                ref={shareButtonRef}
                type="button"
                onClick={() => void shareRoute()}
                className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label={messages.route.share}
                title={messages.route.share}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>

              <button
                type="button"
                onClick={clearRoute}
                className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label={messages.route.resetRoute}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      );
    }

    return withShareFeedback(
      <div ref={measureCollapsed} className={COLLAPSED_POSITION}>
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-2">
          <button
            ref={collapsedActionRef}
            type="button"
            onClick={() => openSheet('to')}
            className="w-full p-2 rounded-xl flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold" aria-hidden="true">🔎</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-gray-800 font-medium truncate">{messages.search.prompt}</div>
              <div className="text-xs text-gray-600 truncate">
                {/* Начало уже задано (ссылка «вы здесь», карта) — это важнее вида карты. */}
                {fromNodeId !== null ? messages.search.fromPoint(fromQuery) : currentScopeLabel}
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return withShareFeedback(
    <>
      {/* На телефоне шторка закрывает карту, и затемнение подсказывает, что
          нажатие мимо её закроет. На широком экране панель стоит сбоку и
          карту с маршрутом не заслоняет — затемнять нечего. */}
      <div className="fixed inset-0 bg-black/20 z-[999] md:hidden" onClick={close} aria-hidden="true" />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={SHEET_TITLE_ID}
        className="fixed bottom-0 left-0 right-0 md:bottom-4 md:left-4 md:right-auto md:w-96 z-[1000]"
      >
        <div className="bg-white md:rounded-2xl rounded-t-3xl shadow-2xl border border-gray-100 overflow-hidden pb-safe-bottom md:pb-0">
          <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-gray-100">
            <div className="min-w-0">
              <h2 id={SHEET_TITLE_ID} className="font-semibold text-gray-800">
                {messages.route.title}
              </h2>
              <div className="text-xs text-gray-600 truncate">{messages.route.view(currentScopeLabel)}</div>
            </div>

            <button
              type="button"
              onClick={close}
              className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label={messages.route.close}
            >
              ✕
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <RouteFields
              activeInput={activeInput}
              onFocusField={setActiveInput}
              onPointChosen={handlePointChosen}
              fromInputRef={fromInputRef}
              toInputRef={toInputRef}
            />

            <RouteOptions />

            <div className="flex gap-2">
              {/* Построенный маршрут уже на экране — кнопка «Построить» над ним
                  только занимала место. */}
              {!currentRoute?.found && (
                <button
                  type="button"
                  onClick={() => {
                    buildRoute();
                    setActiveInput(null);
                  }}
                  disabled={!canBuild}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                    canBuild ? 'bg-primary text-white hover:bg-primary-hover' : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {messages.route.build}
                </button>
              )}

              <button
                type="button"
                onClick={clearRoute}
                className={`py-3 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors ${
                  currentRoute?.found ? 'flex-1' : 'px-4'
                }`}
              >
                {currentRoute?.found ? messages.route.resetRoute : messages.route.reset}
              </button>
            </div>

            <RouteSteps />

            {currentRoute && !currentRoute.found && (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
                {/* Причина — по коду ядра: его текстовое описание рассчитано на
                    разработчика и существует только по-русски. Объявление для
                    экранного диктора делает `RouteAnnouncer`. */}
                <p>{messages.route.notFound(messages.route.failure[currentRoute.reason ?? 'unreachable'])}</p>

                {/* Запрет лестниц — единственное ограничение в интерфейсе, из-за
                    которого точки перестают быть связаны: снять его — одна кнопка. */}
                {currentRoute.reason === 'unreachable' && options.allowStairs === false && (
                  <button
                    type="button"
                    onClick={() => setOptions({ allowStairs: true })}
                    className="mt-2 px-3 py-2 rounded-lg bg-white font-medium text-red-800 hover:bg-red-100 transition-colors"
                  >
                    {messages.route.allowStairs}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
