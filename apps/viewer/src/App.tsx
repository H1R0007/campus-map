import React, { useEffect } from 'react';
import { CampusMap } from './components/Map/CampusMap';
import { BottomSheet } from './components/UI/BottomSheet';
import { MapHeader } from './components/UI/MapHeader';
import { useMapStore } from './stores/mapStore';
import { useDataLoader } from './hooks/useDataLoader';
import { useLanguage, useMessages } from './i18n';

/**
 * Корневой компонент навигатора.
 *
 * Три состояния: загрузка, ошибка и карта. Данные грузятся один раз при
 * монтировании; до завершения рендерится индикатор, чтобы карта не успела
 * отрисоваться с пустым графом.
 *
 * Признак «данные готовы» — это `graph !== null`, а не отдельное поле стора:
 * хранимый дубль того, что уже видно по самим данным, рано или поздно
 * расходится с ними.
 */
const App: React.FC = () => {
  const { isLoading, error, loadAllData } = useDataLoader();
  const isDataLoaded = useMapStore((s) => s.graph !== null);
  const language = useLanguage();
  const messages = useMessages();

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  // Язык документа следует за языком интерфейса: по нему экранный диктор
  // выбирает произношение, а браузер — переносы и предложение перевести
  // страницу.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Первый кадр — ещё до того, как эффект успел выставить `isLoading`.
  // Раньше здесь возвращался `null`, и пользователь видел белый экран.
  if (isLoading || (!isDataLoaded && !error)) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          {/* border-4: класса border-3 в Tailwind нет по умолчанию, и он не
              был расширен в конфиге — из-за этого индикатор был невидимым. */}
          <div
            className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"
            role="status"
            aria-label={messages.app.loading}
          />
          <p className="text-gray-600">{messages.app.loading}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-100 p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-800 mb-2">{messages.app.loadFailed}</h1>
          {/* Техническая причина не переводится: она нужна тому, кому о ней
              сообщат, а не студенту. */}
          <p className="text-sm text-gray-500 mb-4 break-words">{error}</p>
          <button
            type="button"
            // Повторная загрузка, а не `location.reload()`: перезагрузка
            // страницы выбрасывает уже установленный service worker и
            // заставляет заново поднимать всё приложение, тогда как хук
            // умеет повторить ровно неудавшийся запрос.
            onClick={() => void loadAllData()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {messages.app.retry}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative overflow-hidden">
      <CampusMap />
      <MapHeader />
      <BottomSheet />
    </div>
  );
};

export default App;
