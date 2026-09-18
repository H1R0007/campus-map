import { datasetFiles } from '../../utils/datasetFiles';
import { clearDraft, readDraft, writeDraft } from '../../utils/draftStorage';
import type { EditorDraft } from '../../utils/draftStorage';
import { fetchDiskManifest, saveFilesToDisk } from '../../utils/diskStore';
import type { FileHashes } from '../../utils/diskStore';
import { useHistoryStore } from '../historyStore';
import { datasetFromState } from './graphState';
import type { EditorSlice, EditorStore } from './types';

/**
 * Сохранение разметки и черновик несохранённого.
 *
 * Основной путь — запись прямо в `data/` репозитория: команда разметки
 * запускает редактор из него, и правки сразу видит навигатор и забирает git.
 * Где такой возможности нет (развёрнутый редактор), остаётся архив.
 *
 * Пока правки не сохранены, они пишутся черновиком в браузер: закрытая
 * вкладка стирала часы работы без следа.
 */

/** Через сколько после последней правки записывается черновик, миллисекунды. */
const DRAFT_DELAY_MS = 1500;

export interface StorageSlice {
  /** Можно ли писать в каталог данных: редактор открыт из репозитория. */
  diskSaveAvailable: boolean;
  /** Каталог данных на машине разработчика — чтобы сказать, куда сохранено. */
  diskDataDir: string | null;
  /** Отпечатки файлов, с которыми редактор работает: по ним видны чужие правки. */
  diskHashes: FileHashes;
  saving: boolean;

  /**
   * Просьба сохранить, пришедшая с клавиатуры (Ctrl+S).
   *
   * Сохранение проходит через проверку данных, а она живёт в интерфейсе,
   * поэтому клавиша не сохраняет сама, а просит панель это сделать.
   */
  saveRequest: number;
  requestSave: () => void;

  /** Найденный при запуске черновик, пока человек не решил, что с ним делать. */
  draftFound: EditorDraft | null;

  /** Читает манифест каталога данных и черновик; включает автозапись черновика. */
  initStorage: () => Promise<void>;

  /** Пишет правки в каталог данных. */
  saveToDisk: () => Promise<void>;

  /** Скачивает архив с данными — запасной путь. */
  exportArchive: () => Promise<void>;

  restoreDraft: () => void;
  dismissDraft: () => void;
  /** Отложить решение: черновик остаётся до следующего открытия. */
  keepDraft: () => void;
}

export const createStorageSlice: EditorSlice<StorageSlice> = (set, get) => ({
  diskSaveAvailable: false,
  diskDataDir: null,
  diskHashes: {},
  saving: false,
  saveRequest: 0,
  draftFound: null,

  requestSave: () =>
    set((s) => {
      s.saveRequest += 1;
    }),

  initStorage: async () => {
    const manifest = await fetchDiskManifest();
    if (manifest) {
      set((s) => {
        s.diskSaveAvailable = true;
        s.diskDataDir = manifest.dataDir;
        s.diskHashes = manifest.files;
      });
    }

    const draft = await readDraft();
    if (draft) set((s) => { s.draftFound = draft; });

    startDraftAutosave(get);
  },

  saveToDisk: async () => {
    const state = get();
    if (!state.diskSaveAvailable || state.saving) return;

    set((s) => { s.saving = true; });
    try {
      const files = datasetFiles(datasetFromState(state));
      const outcome = await saveFilesToDisk(files, state.diskHashes);

      if (outcome.kind === 'saved') {
        set((s) => {
          s.diskHashes = { ...s.diskHashes, ...outcome.hashes };
        });
        get().markSaved();
        await clearDraft();
        get().showNotice(
          outcome.written.length === 0
            ? 'Сохранять нечего: файлы данных уже такие'
            : `Сохранено в data/: файлов ${outcome.written.length}`
        );
      } else if (outcome.kind === 'conflict') {
        get().showNotice(
          `Файлы на диске изменились после открытия редактора: ${outcome.paths.join(', ')}. ` +
            'Перезагрузите страницу и внесите правки заново или сохраните архив.',
          'warn'
        );
      } else {
        get().showNotice(`Не удалось сохранить: ${outcome.message}`, 'warn');
      }
    } finally {
      set((s) => { s.saving = false; });
    }
  },

  exportArchive: async () => {
    const state = get();
    if (state.saving) return;

    set((s) => { s.saving = true; });
    try {
      const { exportToZip } = await import('../../utils/exportData');
      await exportToZip(datasetFromState(state));
      get().showNotice('Архив с данными скачан. Чтобы правки увидел навигатор, распакуйте его в корень репозитория');
    } finally {
      set((s) => { s.saving = false; });
    }
  },

  restoreDraft: () => {
    const draft = get().draftFound;
    if (!draft) return;

    get().loadData(draft.dataset, [], { unsaved: true });
    set((s) => { s.draftFound = null; });
    get().showNotice('Несохранённая работа восстановлена. Проверьте её и сохраните');
  },

  dismissDraft: () => {
    set((s) => { s.draftFound = null; });
    void clearDraft();
  },

  keepDraft: () => {
    set((s) => { s.draftFound = null; });
  },
});

let autosaveStarted = false;

/**
 * Пишет черновик, пока есть несохранённые правки, и удаляет его, когда их не
 * осталось: отменённая до конца работа не должна предлагаться к восстановлению.
 *
 * Слушается история: каждая правка данных кладёт в неё запись, поэтому
 * отдельная подписка на данные не нужна. Запись отложена — во время разметки
 * правки идут пачками.
 */
function startDraftAutosave(get: () => EditorStore): void {
  if (autosaveStarted) return;
  autosaveStarted = true;

  let timer: number | undefined;

  useHistoryStore.subscribe(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const state = get();
      const unsaved = useHistoryStore.getState().stateId() !== state.savedStateId;

      if (unsaved) {
        void writeDraft({ savedAt: Date.now(), dataset: datasetFromState(state), base: state.diskHashes });
      } else {
        void clearDraft();
      }
    }, DRAFT_DELAY_MS);
  });
}
