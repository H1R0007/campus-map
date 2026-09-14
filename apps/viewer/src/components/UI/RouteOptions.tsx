import React, { useId } from 'react';
import { useMessages } from '../../i18n';
import { useRouteStore } from '../../stores/routeStore';
import { Icon } from './Icon';

interface ChipProps {
  pressed: boolean;
  label: string;
  onToggle: () => void;
}

const Chip: React.FC<ChipProps> = ({ pressed, label, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={pressed}
    className={`h-11 px-4 rounded-full border text-sm font-medium flex items-center gap-2 transition-colors ${
      pressed ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
    }`}
  >
    {pressed && <Icon name="check" size={16} />}
    {label}
  </button>
);

/**
 * Ограничения маршрута, понятные студенту.
 *
 * Из пяти флагов ядра здесь два: «Без лестниц» — для коляски, тележки,
 * травмы — и «Предпочитать лифт». Запрет входов делает корпуса недостижимыми —
 * это инструмент разметчика, и он есть в симуляторе редактора.
 *
 * Ограничения видны сразу в раскрытом обзоре маршрута, а не за раскрывающимся
 * заголовком: скрытое ограничение объясняло «маршрут не найден» только тому, кто
 * знает, где его искать.
 */
export const RouteOptions: React.FC = () => {
  const options = useRouteStore((s) => s.options);
  const setOptions = useRouteStore((s) => s.setOptions);
  const messages = useMessages();
  const titleId = useId();

  const noStairs = options.allowStairs === false;
  const preferLift = options.preferLift === true;

  return (
    <section aria-labelledby={titleId}>
      <h3 id={titleId} className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {messages.route.options}
      </h3>
      <div className="flex flex-wrap gap-2">
        <Chip
          pressed={noStairs}
          label={messages.route.option.noStairs}
          onToggle={() => setOptions({ allowStairs: noStairs })}
        />
        <Chip
          pressed={preferLift}
          label={messages.route.option.preferLift}
          onToggle={() => setOptions({ preferLift: !preferLift })}
        />
      </div>
    </section>
  );
};
