import React from 'react';
import { messagesFor, useLanguage } from '../../i18n';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { sameScope } from '../../utils/routeFloors';
import type { RouteStep } from '../../utils/routeInstructions';
import { stepMeta } from '../../utils/routeSummary';
import { RouteStepIcon } from './RouteStepIcon';

interface RouteStepsProps {
  steps: RouteStep[];
  /** Шаг пошаговой навигации; `null` — подсвечиваются шаги на открытом этаже. */
  currentIndex: number | null;
  /** Нажатие на шаг — пошаговая навигация с этого шага. */
  onSelect: (index: number) => void;
}

/**
 * Список шагов маршрута.
 *
 * Весь шаг — кнопка: нажатие открывает пошаговую навигацию с этого шага, а она
 * — его этаж. Раньше под каждым шагом стояла отдельная маленькая кнопка
 * «Открыть этаж N», и что сейчас на карте, по списку было не понять.
 *
 * Подсвечен текущий шаг навигации, а в обзоре — шаги на открытом этаже. У
 * каждого шага значок (`RouteStepIcon`), последовательность показывает линия
 * между значками, номер для экранного диктора даёт нумерованный список.
 */
export const RouteSteps: React.FC<RouteStepsProps> = ({ steps, currentIndex, onSelect }) => {
  const activeFloor = useMapStore((s) => s.activeFloor);
  const language = useLanguage();
  const messages = messagesFor(language);

  if (steps.length === 0) return null;

  const view = scopeOf(activeFloor);

  return (
    <section aria-label={messages.route.stepsTitle}>
      {/* Сводка маршрута — в заголовке обзора над шагами, здесь её не повторяем. */}
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{messages.route.stepsTitle}</h3>

      <ol className="space-y-1">
        {steps.map((step, index) => {
          const isCurrent = currentIndex !== null ? index === currentIndex : sameScope(step.scope, view);
          const isLast = index === steps.length - 1;
          const meta = stepMeta(step, language);

          return (
            // Ключ по индексу допустим: список пересобирается целиком вместе с маршрутом.
            <li key={index}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`relative w-full flex items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors ${
                  isCurrent ? 'bg-selected' : 'hover:bg-gray-50'
                }`}
              >
                {/* Линия от значка к значку следующего шага: отступ кнопки,
                    промежуток списка и отступ следующей кнопки. */}
                {!isLast && (
                  <span aria-hidden="true" className="absolute left-[1.1875rem] top-8 -bottom-3 w-0.5 bg-gray-200" />
                )}
                <RouteStepIcon step={step} isLast={isLast} />
                {/* Действие и место — отдельными строками: место — имя из
                    данных, и склонять его нельзя. */}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-800">{step.title}</span>
                  <span className="block text-xs text-gray-600">{step.place}</span>
                </span>
                {meta !== null && <span className="text-xs text-gray-600 whitespace-nowrap">{meta}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
