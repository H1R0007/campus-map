import React, { useEffect, useId, useRef, useState } from 'react';
import { buildingName } from '@campus-map/core';
import { messagesFor, useLanguage } from '../../i18n';
import { shownFloorOf, useMapStore } from '../../stores/mapStore';
import { Icon } from './Icon';

/**
 * Корпуса на территории — кнопкой со списком, в шапке телефона.
 *
 * Лента корпусов на телефоне занимала всю ширину шапки и вместе с
 * переключателем языка закрывала верх карты целой полосой. Кнопка занимает
 * место одной подписи, а список открывается по нажатию — под ней, поверх
 * карты. Выбор корпуса — как в ленте: этаж, открытый в нём последним, а
 * впервые — входной (`shownFloorOf`).
 *
 * Список закрывается выбором, Escape и нажатием мимо. При открытии фокус — на
 * первом корпусе, после Escape — снова на кнопке.
 */
export const BuildingMenu: React.FC = () => {
  const campusMeta = useMapStore((s) => s.campusMeta);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const buildingFloors = useMapStore((s) => s.buildingFloors);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);
  const language = useLanguage();
  const messages = messagesFor(language);
  const listId = useId();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLButtonElement>('li button')?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!campusMeta || !buildingMetas) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className="h-11 px-4 rounded-xl bg-surface shadow-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
      >
        <Icon name="building" size={16} className="flex-shrink-0 text-gray-500" />
        {messages.map.buildings}
        <Icon name={open ? 'expand' : 'collapse'} size={16} className="flex-shrink-0 text-gray-500" />
      </button>

      {open && (
        <ul
          id={listId}
          aria-label={messages.map.buildings}
          className="campus-building-menu absolute left-0 top-full mt-2 w-max min-w-[12rem] overflow-y-auto overscroll-contain rounded-2xl bg-surface py-1 shadow-xl"
        >
          {campusMeta.buildings.map((building) => {
            const meta = buildingMetas.get(building.id);

            return (
              <li key={building.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setActiveFloor(building.id, shownFloorOf(buildingFloors, meta, building.id));
                  }}
                  className="w-full min-h-[2.75rem] px-4 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 transition-colors flex items-center gap-3"
                >
                  <Icon name="building" size={16} className="flex-shrink-0 text-gray-500" />
                  <span className="min-w-0 truncate">{meta ? buildingName(meta, language) : building.name ?? building.id}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
