import React from 'react';
import { useStepNavigation } from '../../hooks/useStepNavigation';
import { messagesFor, useLanguage } from '../../i18n';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { scopeLabel } from '../../utils/placeLabels';
import { formatDuration } from '../../utils/routeInstructions';
import { remainingSeconds } from '../../utils/routeSummary';
import { Icon } from './Icon';

/**
 * Шапка карты на шаге пошаговой навигации: ход маршрута вместо ленты корпусов
 * (запись 23).
 *
 * Номер шага, полоса пройденного и что открыто на карте — «Корпус А, этаж 3»,
 * с метрикой ещё и сколько осталось идти. Выход из навигации — здесь же, а не в
 * панели: в панели остаётся только сам шаг, крупно, с «Далее» и «Назад» под
 * большим пальцем. Возврата на территорию в пути нет: этаж открывает шаг, а
 * сменить его вручную можно в колонке этажей.
 */
export const TripBar: React.FC = () => {
  const { steps, index, exit } = useStepNavigation();
  const activeFloor = useMapStore((s) => s.activeFloor);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const language = useLanguage();
  const messages = messagesFor(language);

  if (index === null || !buildingMetas) return null;

  const stepOf = messages.navigation.stepOf(index + 1, steps.length);
  const seconds = remainingSeconds(steps, index);
  const where = scopeLabel(scopeOf(activeFloor), buildingMetas, language);
  const details =
    seconds === null ? where : `${where} · ${messages.navigation.remaining(formatDuration(seconds, language))}`;

  return (
    <>
      <button
        type="button"
        onClick={exit}
        aria-label={messages.navigation.exit}
        title={messages.navigation.exit}
        className="w-11 h-11 flex-shrink-0 rounded-xl bg-surface shadow-md flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Icon name="close" />
      </button>

      <div className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-surface shadow-md flex flex-col justify-center wide:max-w-sm">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="flex-shrink-0 text-sm font-semibold text-gray-900">{stepOf}</span>
          <span className="min-w-0 truncate text-xs text-gray-600">{details}</span>
        </div>
        <div
          role="progressbar"
          aria-label={messages.navigation.progress}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
          aria-valuetext={stepOf}
          className="mt-1 h-1 rounded-full bg-gray-200 overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    </>
  );
};
