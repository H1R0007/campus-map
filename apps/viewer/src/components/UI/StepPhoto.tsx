import React, { useEffect, useRef, useState } from 'react';
import { landmarkText } from '@campus-map/core';
import { SHORT_SCREEN_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { useLanguage, useMessages } from '../../i18n';
import { DATA_LANGUAGE } from '../../i18n/languages';
import { useMapStore } from '../../stores/mapStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { photoSrc, pointPhotos } from '../../utils/photos';
import type { RouteStep } from '../../utils/routeInstructions';
import { Icon } from './Icon';
import { PhotoViewer } from './PhotoViewer';

interface StepPhotoProps {
  step: RouteStep;
}

/**
 * Фото точки, к которой ведёт шаг маршрута (запись 86): ориентира, двери
 * перехода, цели. Стоит над текстом шага — текст остаётся во всю ширину и не
 * ломается на строки.
 *
 * - На обычном экране — полосой: ориентир узнаётся с первого взгляда.
 * - На невысоком экране — строкой с миниатюрой и названием: полоса сжала бы
 *   карту над шторкой.
 * - Свёрнутое — тонкой строкой с маленьким квадратиком фото. Кто свернул фото
 *   на одном шаге, хочет больше карты и дальше: выбор запоминается.
 *
 * Нажатие на фото в любом виде открывает его во весь экран. Нет фото или
 * маленькое не загрузилось (нет связи, и оно не сохранено) — шаг такой же, как
 * без фото.
 */
export const StepPhoto: React.FC<StepPhotoProps> = ({ step }) => {
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const collapsed = useSettingsStore((s) => s.stepPhotoCollapsed);
  const setCollapsed = useSettingsStore((s) => s.setStepPhotoCollapsed);
  const short = useMediaQuery(SHORT_SCREEN_QUERY);
  const language = useLanguage();
  const messages = useMessages();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  // Свернули или развернули кнопкой — фокус на кнопку обратного действия:
  // нажатая исчезает из разметки, и клавиатура не должна терять место.
  const toggled = useRef(false);
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    (collapsed ? expandRef : collapseRef).current?.focus();
  }, [collapsed]);
  const toggle = (next: boolean) => {
    toggled.current = true;
    setCollapsed(next);
  };

  const photos = pointPhotos(graph, step.subject);
  const node = step.subject ? graph?.getNode(step.subject) : undefined;
  if (photos.length === 0 || failed || !node) return null;

  // Подпись фото — то, что на нём: ориентир, иначе название места, иначе место шага.
  const title = node.landmark
    ? landmarkText(node.landmark, language, DATA_LANGUAGE).name
    : (aliasManager?.getPrimaryAliasForId(node.id, language) ?? step.place);
  const openLabel = messages.photo.open(title, photos.length);
  const src = photoSrc(photos[0], 'small');
  const form = collapsed ? 'collapsed' : short ? 'row' : 'strip';

  const image = <img src={src} alt="" decoding="async" onError={() => setFailed(true)} className="w-full h-full object-cover" />;
  const photoButton = (className: string) => (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={openLabel}
      title={openLabel}
      className={`relative flex-shrink-0 overflow-hidden bg-gray-100 ring-1 ring-black/10 ${className}`}
    >
      {image}
    </button>
  );
  const collapseButton = (className: string) => (
    <button
      ref={collapseRef}
      type="button"
      onClick={() => toggle(true)}
      aria-label={messages.photo.collapse}
      title={messages.photo.collapse}
      className={`w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${className}`}
    >
      <Icon name="collapse" size={20} />
    </button>
  );

  return (
    <div data-step-photo={form} className="mb-3">
      {form === 'strip' && (
        <div className="relative">
          {photoButton('block w-full aspect-[2/1] rounded-2xl')}
          {/* Значок «во весь экран» — подсказка, что фото нажимается; кнопка — само фото. */}
          <span aria-hidden="true" className="pointer-events-none absolute right-2 bottom-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center">
            <Icon name="fit" size={16} />
          </span>
          {collapseButton('absolute right-1 top-1 bg-black/60 text-white hover:bg-black/75')}
        </div>
      )}

      {form === 'row' && (
        <div className="flex items-center gap-3">
          {photoButton('w-24 h-16 rounded-xl')}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
            <p className="text-xs text-gray-600">{messages.photo.enlarge}</p>
          </div>
          {collapseButton('-mr-2 text-gray-600 hover:bg-gray-100')}
        </div>
      )}

      {form === 'collapsed' && (
        <div className="flex items-center gap-2">
          {photoButton('w-11 h-11 rounded-lg')}
          <button
            ref={expandRef}
            type="button"
            onClick={() => toggle(false)}
            aria-expanded="false"
            className="flex-1 min-w-0 h-11 -mr-2 pl-1 pr-2 rounded-xl flex items-center gap-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="flex-1 min-w-0 truncate">{messages.photo.open(title, photos.length)}</span>
            <span className="flex-shrink-0 inline-flex items-center gap-1 font-medium text-accent">
              {messages.photo.expand}
              <Icon name="expand" size={18} />
            </span>
          </button>
        </div>
      )}

      {open && <PhotoViewer photos={photos} title={title} subtitle={step.place} onClose={() => setOpen(false)} />}
    </div>
  );
};
