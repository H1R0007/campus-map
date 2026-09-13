import React, { useState } from 'react';
import { useMessages } from '../../i18n';
import { useRouteStore } from '../../stores/routeStore';

interface ToggleProps {
  pressed: boolean;
  label: string;
  onToggle: () => void;
}

const Toggle: React.FC<ToggleProps> = ({ pressed, label, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={pressed}
    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      pressed ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`}
  >
    {label}
  </button>
);

/**
 * Ограничения маршрута, понятные студенту.
 *
 * Из пяти флагов ядра здесь два: «Без лестниц» — для коляски, тележки,
 * травмы — и «Предпочитать лифт». Раньше интерфейс показывал все пять, и
 * выключенные по умолчанию «Лестницы», «Лифты», «Переходы», «Входы» читались
 * наоборот: нажатая кнопка значила «разрешено». Запрет входов делает корпуса
 * недостижимыми — это инструмент разметчика, и он есть в симуляторе
 * редактора.
 *
 * Блок раскрыт сам, если ограничение уже включено: скрытое ограничение
 * объясняло бы «маршрут не найден» только тому, кто знает, где его искать.
 */
export const RouteOptions: React.FC = () => {
  const options = useRouteStore((s) => s.options);
  const setOptions = useRouteStore((s) => s.setOptions);
  const messages = useMessages();

  const noStairs = options.allowStairs === false;
  const preferLift = options.preferLift === true;
  const [open, setOpen] = useState(noStairs || preferLift);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
        aria-expanded={open}
      >
        {open ? '▾' : '▸'} {messages.route.options}
      </button>

      {open && (
        <div className="flex flex-wrap gap-2 mt-2">
          <Toggle
            pressed={noStairs}
            label={messages.route.option.noStairs}
            onToggle={() => setOptions({ allowStairs: noStairs })}
          />
          <Toggle
            pressed={preferLift}
            label={messages.route.option.preferLift}
            onToggle={() => setOptions({ preferLift: !preferLift })}
          />
        </div>
      )}
    </div>
  );
};
