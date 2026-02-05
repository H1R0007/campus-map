import React, { useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';

export const LineToolPanel: React.FC = () => {
  const activeTool = useEditorStore((s) => s.activeTool);
  const lt = useEditorStore((s) => s.lineTool);

  const lineSetCount = useEditorStore((s) => s.lineSetCount);
  const lineSetAutoConnect = useEditorStore((s) => s.lineSetAutoConnect);
  const lineConfirm = useEditorStore((s) => s.lineConfirm);
  const lineReset = useEditorStore((s) => s.lineReset);

  const handleCountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (Number.isFinite(value)) {
      lineSetCount(value);
    }
  }, [lineSetCount]);

  const handleAutoConnectChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    lineSetAutoConnect(e.target.checked);
  }, [lineSetAutoConnect]);

  const handleConfirm = useCallback(() => {
    try {
      lineConfirm();
    } catch (err) {
      console.error('Line confirm error:', err);
    }
  }, [lineConfirm]);

  const handleReset = useCallback(() => {
    try {
      lineReset();
    } catch (err) {
      console.error('Line reset error:', err);
    }
  }, [lineReset]);

  // Не показываем панель если не выбран LineTool
  if (activeTool !== 'line') return null;
  
  // Не показываем панель если нет начальной точки
  if (!lt.start) return null;

  const canConfirm = lt.start !== null && lt.end !== null;

  return (
    <div
      className="absolute right-3 bottom-10 w-[340px] z-[1700] rounded-2xl shadow-2xl overflow-hidden"
      style={{ 
        backgroundColor: 'var(--editor-panel)', 
        border: '1px solid var(--editor-border)' 
      }}
      // Предотвращаем всплытие событий мыши на карту
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header */}
      <div 
        className="px-4 py-3 flex items-center justify-between" 
        style={{ borderBottom: '1px solid var(--editor-border)' }}
      >
        <div className="text-white font-semibold">Line Tool</div>
        <button 
          onClick={handleReset} 
          className="p-2 rounded-xl hover:bg-white/10 transition-colors" 
          style={{ color: 'var(--editor-text-muted)' }} 
          title="Сбросить"
          type="button"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Status message */}
        {!lt.end ? (
          <div className="text-sm" style={{ color: 'var(--editor-text-muted)' }}>
            Кликните <b style={{ color: 'white' }}>ЛКМ</b> на карте для выбора{' '}
            <b style={{ color: 'white' }}>конечной точки</b>.
          </div>
        ) : (
          <div className="text-sm" style={{ color: 'var(--editor-text-muted)' }}>
            Настройте параметры и нажмите <b style={{ color: 'white' }}>Создать</b>.
          </div>
        )}

        {/* Count input */}
        <div>
          <label className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
            Количество узлов (2–50)
          </label>
          <input
            type="number"
            value={lt.count}
            min={2}
            max={50}
            step={1}
            onChange={handleCountChange}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ 
              backgroundColor: 'var(--editor-bg)', 
              border: '1px solid var(--editor-border)', 
              color: 'white' 
            }}
          />
        </div>

        {/* Auto-connect checkbox */}
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={lt.autoConnect}
            onChange={handleAutoConnectChange}
            className="w-4 h-4 rounded"
          />
          <span style={{ color: 'white' }}>Auto-connect цепочкой</span>
        </label>

        {/* Action buttons */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleReset}
            type="button"
            className="flex-1 px-4 py-2.5 rounded-xl text-sm transition-colors hover:opacity-80"
            style={{ 
              backgroundColor: 'var(--editor-accent)', 
              color: 'white', 
              border: '1px solid var(--editor-border)' 
            }}
          >
            Отмена
          </button>

          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            type="button"
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              backgroundColor: canConfirm ? 'var(--editor-highlight)' : 'rgba(255,255,255,0.08)',
              color: canConfirm ? 'white' : 'var(--editor-text-muted)',
              border: '1px solid var(--editor-border)',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
          >
            Создать
          </button>
        </div>

        {/* Coordinates info */}
        {lt.start && (
          <div className="text-xs pt-2 space-y-1" style={{ color: 'var(--editor-text-muted)' }}>
            <div>Начало: ({Math.round(lt.start.x)}, {Math.round(lt.start.y)})</div>
            {lt.end && (
              <div>Конец: ({Math.round(lt.end.x)}, {Math.round(lt.end.y)})</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};