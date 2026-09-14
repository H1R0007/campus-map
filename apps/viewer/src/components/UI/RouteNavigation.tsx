import React from 'react';
import { useStepNavigation } from '../../hooks/useStepNavigation';
import { messagesFor, useLanguage } from '../../i18n';
import { useMapView } from '../../hooks/useMapView';
import { useRouteStore } from '../../stores/routeStore';
import { isScopeShown } from '../../utils/mapView';
import { stepMeta } from '../../utils/routeSummary';
import { Icon } from './Icon';
import { RouteStepIcon } from './RouteStepIcon';
import { RouteSteps } from './RouteSteps';

interface RouteNavigationProps {
  /** Показать под текущим шагом весь список. На широком экране — всегда. */
  expanded: boolean;
}

const PRIMARY_BUTTON =
  'flex-1 min-w-0 h-14 px-4 rounded-2xl bg-primary text-white text-lg font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors';

/**
 * Пошаговая навигация — режим «в пути»: на экране только текущий шаг, крупно
 * (запись 23).
 *
 * Человек идёт по шумному коридору с телефоном в руке и читает шаг на ходу:
 * действие — крупным заголовком, «Далее» и «Назад» — высокими кнопками под
 * большим пальцем. Номер шага, ход маршрута и выход — в шапке карты
 * (`TripBar`); экран на шаге не гаснет (`useWakeLock` в `NavigatorPanel`).
 *
 * Шаг сам открывает свой этаж, а слой маршрута подсвечивает его участок
 * (`PathLayer`). Если человек переключил этаж вручную, карточка предлагает
 * вернуться к шагу, а не уводит карту сама.
 *
 * Смену шага экранному диктору объявляет область `aria-live` вокруг текста
 * шага: фокус при этом остаётся на кнопке «Далее».
 */
export const RouteNavigation: React.FC<RouteNavigationProps> = ({ expanded }) => {
  const { steps, index, goTo, showCurrent } = useStepNavigation();
  const finish = useRouteStore((s) => s.finish);
  const view = useMapView();
  const language = useLanguage();
  const messages = messagesFor(language);

  if (index === null) return null;

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const meta = stepMeta(step, language);
  const offView = !isScopeShown(view, step.scope);

  return (
    <div className="px-4 pb-4">
      <div className="flex items-start gap-3" aria-live="polite" aria-atomic="true">
        <RouteStepIcon step={step} isLast={isLast} size="lg" />
        <div className="flex-1 min-w-0">
          <h2 data-panel-focus tabIndex={-1} className="text-2xl font-bold leading-tight text-gray-900 outline-none">
            {step.title}
          </h2>
          <p className="mt-1 text-base text-gray-700 text-balance">{step.place}</p>
          {meta !== null && <p className="text-base text-gray-600">{meta}</p>}
        </div>
      </div>

      {offView && (
        <button
          type="button"
          onClick={showCurrent}
          className="mt-2 -ml-3 h-11 px-3 rounded-xl inline-flex items-center gap-2 text-sm font-medium text-accent hover:bg-selected transition-colors"
        >
          <Icon name="layers" size={18} />
          {messages.navigation.showOnMap}
        </button>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label={messages.navigation.previous}
          title={messages.navigation.previous}
          className="w-14 h-14 flex-shrink-0 rounded-2xl bg-gray-100 text-gray-800 flex items-center justify-center hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:hover:bg-gray-100"
        >
          <Icon name="back" size={24} />
        </button>

        {isLast ? (
          <button type="button" onClick={finish} className={PRIMARY_BUTTON}>
            <Icon name="check" size={24} />
            {messages.navigation.finish}
          </button>
        ) : (
          <button type="button" onClick={() => goTo(index + 1)} className={PRIMARY_BUTTON}>
            {messages.navigation.next}
            <Icon name="forward" size={24} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-5">
          <RouteSteps steps={steps} currentIndex={index} onSelect={goTo} />
        </div>
      )}
    </div>
  );
};
