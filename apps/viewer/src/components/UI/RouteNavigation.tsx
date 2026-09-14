import React from 'react';
import { useStepNavigation } from '../../hooks/useStepNavigation';
import { messagesFor, useLanguage } from '../../i18n';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { sameScope } from '../../utils/routeFloors';
import { stepMeta } from '../../utils/routeSummary';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { RouteStepIcon } from './RouteStepIcon';
import { RouteSteps } from './RouteSteps';

interface RouteNavigationProps {
  /** Показать под текущим шагом весь список. На широком экране — всегда. */
  expanded: boolean;
}

const PRIMARY_BUTTON =
  'flex-1 min-w-0 h-12 px-4 rounded-xl bg-primary text-white font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors';

/**
 * Пошаговая навигация: один шаг на экране, «Далее» и «Назад».
 *
 * Раньше шаги были только списком в модальной шторке, и идти по нему, глядя
 * на карту, было нельзя. Здесь шаг сам открывает свой этаж, а слой маршрута
 * подсвечивает его участок (`PathLayer`). Если человек переключил этаж вручную,
 * карточка предлагает вернуться к шагу, а не уводит карту сама.
 *
 * Смену шага экранному диктору объявляет область `aria-live` вокруг текста
 * шага: фокус при этом остаётся на кнопке «Далее».
 */
export const RouteNavigation: React.FC<RouteNavigationProps> = ({ expanded }) => {
  const { steps, index, goTo, showCurrent, exit } = useStepNavigation();
  const activeFloor = useMapStore((s) => s.activeFloor);
  const language = useLanguage();
  const messages = messagesFor(language);

  if (index === null) return null;

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const meta = stepMeta(step, language);
  const offView = !sameScope(step.scope, scopeOf(activeFloor));

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm font-medium text-gray-600">{messages.navigation.stepOf(index + 1, steps.length)}</p>
        <IconButton icon="close" label={messages.navigation.exit} onClick={exit} className="-mr-2" />
      </div>

      <div className="flex items-start gap-3" aria-live="polite" aria-atomic="true">
        <RouteStepIcon step={step} isLast={isLast} size="lg" />
        <div className="flex-1 min-w-0 pt-0.5">
          <h2 data-panel-focus tabIndex={-1} className="text-lg font-semibold leading-snug text-gray-900 outline-none">
            {step.title}
          </h2>
          <p className="text-sm text-gray-600">{step.place}</p>
          {meta !== null && <p className="text-sm text-gray-500">{meta}</p>}
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

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label={messages.navigation.previous}
          title={messages.navigation.previous}
          className="w-12 h-12 flex-shrink-0 rounded-xl bg-gray-100 text-gray-800 flex items-center justify-center hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:hover:bg-gray-100"
        >
          <Icon name="back" />
        </button>

        {isLast ? (
          <button type="button" onClick={exit} className={PRIMARY_BUTTON}>
            <Icon name="check" />
            {messages.navigation.finish}
          </button>
        ) : (
          <button type="button" onClick={() => goTo(index + 1)} className={PRIMARY_BUTTON}>
            {messages.navigation.next}
            <Icon name="forward" />
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
