import { PHOTOS_DIR, datasetUrl } from '@campus-map/core';
import { DATA_BASE_URL } from '../../config/dataBase';
import { SPACE, spaceHref } from '../../config/space';
import { clearDraft, readDraft, writeDraft } from '../../utils/draftStorage';
import type { EditorDraft } from '../../utils/draftStorage';
import { fetchDiskManifest, fetchSandboxState, resetSandbox, saveFilesToDisk, uploadToDisk } from '../../utils/diskStore';
import type { DiskManifest, FileHashes, SandboxState, SaveOutcome } from '../../utils/diskStore';
import { leavePage, reloadPage } from '../../utils/leavePage';
import { heldFiles, holdFile, planFilesByHash, restoreHeldFiles } from '../../utils/planFiles';
import { isPlanFile, planSave } from '../../utils/saveFiles';
import { plural } from '../../utils/labels';
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
  /** Исходники планов, которые уже лежат в `data-sources/`. */
  diskSources: Set<string>;
  /** Файлы фото, которые есть в данных и в общей папке фото (запись 87). */
  diskPhotos: Set<string>;
  /**
   * Общая папка фото: путь, `null` — не настроена (фото ложатся в
   * `data/photos/`), `undefined` — неизвестно (редактор не из репозитория).
   */
  photosDir: string | null | undefined;
  /**
   * Файлы данных, которые редактор знает: понял при открытии или сам
   * сохранил. Удалить сохранение может только их (запись 47).
   */
  ownedFiles: Set<string>;
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

  /**
   * Читает манифест каталога данных (или берёт уже прочитанный) и черновик;
   * включает автозапись черновика.
   */
  initStorage: (manifest?: DiskManifest | null) => Promise<void>;

  /** Пишет правки в каталог данных. */
  saveToDisk: () => Promise<void>;

  /** Скачивает архив с данными — запасной путь. */
  exportArchive: () => Promise<void>;

  restoreDraft: () => void;
  dismissDraft: () => void;
  /** Отложить решение: черновик остаётся до следующего открытия. */
  keepDraft: () => void;

  /** Учебная копия (запись 55); `null` — здесь её не бывает (редактор не из репозитория). */
  sandbox: SandboxState | null;
  /**
   * Открыть учебную копию. `fresh` — начать с чистой копии настоящих данных.
   * Несохранённое записывается в черновик и вернётся с этими данными.
   *
   * @returns текст ошибки, если копию не удалось сделать
   */
  enterSandbox: (fresh: boolean) => Promise<string | null>;
  /** Выйти из учебной копии к настоящим данным. */
  leaveSandbox: () => Promise<void>;
  /** В копии: выбросить пробы и начать с чистой копии. */
  restartSandbox: () => Promise<string | null>;
}

export const createStorageSlice: EditorSlice<StorageSlice> = (set, get) => ({
  diskSaveAvailable: false,
  diskDataDir: null,
  diskHashes: {},
  diskSources: new Set(),
  diskPhotos: new Set(),
  photosDir: undefined,
  ownedFiles: new Set(),
  saving: false,
  saveRequest: 0,
  draftFound: null,
  sandbox: null,

  requestSave: () =>
    set((s) => {
      s.saveRequest += 1;
    }),

  initStorage: async (prefetched) => {
    const manifest = prefetched === undefined ? await fetchDiskManifest() : prefetched;
    if (manifest) {
      set((s) => {
        s.diskSaveAvailable = true;
        s.diskDataDir = manifest.dataDir;
        s.diskHashes = manifest.files;
        s.diskSources = new Set(manifest.sources);
        s.diskPhotos = new Set(manifest.photos);
        s.photosDir = manifest.photosDir;
        // Планы узнаются по отпечаткам: путь файла меняется, содержимое — нет.
        s.planFiles = planFilesByHash(s.planFiles, manifest.files);
      });
    }
    // Что редактор понял при открытии, то он и вправе удалить.
    set((s) => {
      s.ownedFiles = new Set(
        savePlanOf(get()).produced.filter((path) => manifest === null || manifest.files[path] !== undefined)
      );
    });

    const draft = await readDraft();
    if (draft) set((s) => { s.draftFound = draft; });

    const sandbox = manifest ? await fetchSandboxState() : null;
    set((s) => { s.sandbox = sandbox; });

    startDraftAutosave(get);
  },

  saveToDisk: async () => {
    const state = get();
    if (!state.diskSaveAvailable || state.saving) return;

    set((s) => { s.saving = true; });
    try {
      const plan = savePlanOf(state);
      if (plan.lost.length > 0) {
        get().showNotice(
          `Не найдено содержимое планов: ${plan.lost.join(', ')}. Добавьте эти планы заново — остальное не сохранено, чтобы ничего не потерять`,
          'warn'
        );
        return;
      }

      // Удаляемый план запоминается: отмена удаления этажа после сохранения
      // вернёт и его план.
      for (const path of plan.delete.filter(isPlanFile)) await rememberDiskFile(path);

      const outcome = await uploadAndSave(plan, state.diskHashes);

      if (outcome.kind === 'saved') {
        set((s) => {
          const hashes = { ...s.diskHashes, ...outcome.hashes };
          for (const path of outcome.deleted) delete hashes[path];
          s.diskHashes = hashes;
          for (const name of outcome.sources) s.diskSources.add(name);
          for (const path of [...outcome.written, ...outcome.unchanged]) {
            if (path.startsWith(`${PHOTOS_DIR}/`)) s.diskPhotos.add(path.slice(PHOTOS_DIR.length + 1));
          }
          s.ownedFiles = new Set(plan.produced);
        });
        get().markSaved();
        await clearDraft();
        if (plan.missingPhotos.length > 0) {
          get().showNotice(
            `Сохранено, но нет ${plan.missingPhotos.length} ${plural(plan.missingPhotos.length, ['файла', 'файлов', 'файлов'])} фото: их добавили на другой машине, а общая папка фото ещё не синхронизировалась. Данные целы`,
            'warn'
          );
          return;
        }
        const deleted = outcome.deleted.length;
        get().showNotice(
          outcome.written.length === 0 && deleted === 0
            ? 'Сохранять нечего: файлы данных уже такие'
            : `Сохранено в ${SPACE === 'sandbox' ? 'учебную копию' : 'data/'}: файлов ${outcome.written.length}` +
                (deleted > 0 ? `, удалено ${deleted} ${plural(deleted, ['файл', 'файла', 'файлов'])}` : '')
        );
      } else if (outcome.kind === 'conflict') {
        get().showNotice(
          `Файлы на диске изменились после открытия редактора: ${outcome.paths.join(', ')}. ` +
            'Перезагрузите страницу и внесите правки заново или сохраните архив.',
          'warn'
        );
      } else if (outcome.kind === 'missing-upload') {
        get().showNotice('Не удалось передать файлы плана на диск. Попробуйте сохранить ещё раз', 'warn');
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
      const plan = savePlanOf(state);
      if (plan.lost.length > 0) {
        get().showNotice(`Не найдено содержимое планов: ${plan.lost.join(', ')}. Добавьте эти планы заново`, 'warn');
        return;
      }
      const held = (sha256: string) => plan.uploads.find((file) => file.sha256 === sha256)?.blob;
      const plans: { path: string; blob: Blob }[] = [];
      for (const [path, file] of Object.entries(plan.files)) {
        const blob = 'upload' in file ? held(file.upload) : 'copy' in file ? await fetchDataFile(file.copy) : undefined;
        if (blob) plans.push({ path, blob });
      }
      const sources = Object.entries(plan.sources).flatMap(([name, { upload }]) => {
        const blob = held(upload);
        return blob ? [{ name, blob }] : [];
      });

      const { exportToZip } = await import('../../utils/exportData');
      await exportToZip(datasetFromState(state), { plans, sources, deleted: plan.delete });
      get().showNotice(
        'Архив с данными скачан. Чтобы правки увидел навигатор, распакуйте его в корень репозитория' +
          (plan.delete.length > 0 ? ' и удалите файлы, перечисленные в README.md архива' : '')
      );
    } finally {
      set((s) => { s.saving = false; });
    }
  },

  restoreDraft: () => {
    const draft = get().draftFound;
    if (!draft) return;

    restoreHeldFiles(draft.heldFiles ?? []);
    get().loadData(draft.dataset, [], {
      unsaved: true,
      planFiles: draft.planFiles ? new Map(draft.planFiles) : undefined,
    });
    set((s) => {
      s.draftFound = null;
      // Черновик прежней версии редактора планов не помнит: они — те, что на диске.
      if (s.diskSaveAvailable) s.planFiles = planFilesByHash(s.planFiles, s.diskHashes);
    });
    get().showNotice('Несохранённая работа восстановлена. Проверьте её и сохраните');
  },

  dismissDraft: () => {
    set((s) => { s.draftFound = null; });
    void clearDraft();
  },

  keepDraft: () => {
    set((s) => { s.draftFound = null; });
  },

  enterSandbox: async (fresh) => {
    const current = get().sandbox;
    if (fresh || !current?.exists) {
      const error = await resetSandbox();
      if (error) return error;
    }
    await writeDraftNow(get());
    leavePage(spaceHref('sandbox'));
    return null;
  },

  leaveSandbox: async () => {
    await writeDraftNow(get());
    leavePage(spaceHref('main'));
  },

  restartSandbox: async () => {
    const error = await resetSandbox();
    if (error) return error;
    await clearDraft();
    reloadPage();
    return null;
  },
});

/** Что сделать с файлами, чтобы на диске оказалось состояние редактора. */
function savePlanOf(state: EditorStore) {
  return planSave({
    dataset: datasetFromState(state),
    planFiles: state.planFiles,
    diskHashes: state.diskHashes,
    diskSources: state.diskSources,
    owned: state.ownedFiles,
    diskPhotos: state.diskPhotos,
  });
}

/** Файл каталога данных с сервера — для архива. */
async function fetchDataFile(path: string): Promise<Blob | undefined> {
  try {
    const response = await fetch(datasetUrl(path, DATA_BASE_URL), { cache: 'no-store' });
    return response.ok ? await response.blob() : undefined;
  } catch {
    return undefined;
  }
}

/** Кладёт файл с диска в память редактора. Не прочитался — отмена его не вернёт, но сохранению это не мешает. */
async function rememberDiskFile(path: string): Promise<void> {
  try {
    const response = await fetch(datasetUrl(path, DATA_BASE_URL), { cache: 'no-store' });
    if (response.ok) await holdFile(await response.blob());
  } catch {
    // Сервер не отдал файл — сохранение всё равно идёт.
  }
}

/**
 * Загружает большие файлы и сохраняет. Если загрузка пропала до сохранения
 * (временный каталог очищен), она повторяется один раз.
 */
async function uploadAndSave(plan: ReturnType<typeof planSave>, base: FileHashes): Promise<SaveOutcome> {
  for (const file of plan.uploads) {
    const error = await uploadToDisk(file);
    if (error) return { kind: 'error', message: error };
  }
  const request = { files: plan.files, delete: plan.delete, sources: plan.sources };
  const outcome = await saveFilesToDisk(request, base);
  if (outcome.kind !== 'missing-upload') return outcome;

  const missing = plan.uploads.find((file) => file.sha256 === outcome.sha256);
  if (!missing || (await uploadToDisk(missing)) !== null) return outcome;
  return saveFilesToDisk(request, base);
}

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
      void writeDraftNow(get());
    }, DRAFT_DELAY_MS);
  });
}

/**
 * Черновик — сейчас: есть несохранённое — записать, нет — убрать прежний.
 * Перед уходом в учебную копию и обратно запись не ждёт паузы в правках.
 */
async function writeDraftNow(state: EditorStore): Promise<void> {
  const unsaved = useHistoryStore.getState().stateId() !== state.savedStateId;
  if (!unsaved) {
    await clearDraft();
    return;
  }
  await writeDraft({
    savedAt: Date.now(),
    dataset: datasetFromState(state),
    base: state.diskHashes,
    planFiles: [...state.planFiles.entries()],
    heldFiles: heldFiles(),
  });
}
