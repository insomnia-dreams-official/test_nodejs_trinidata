import {Worker} from "worker_threads";
import {appState, treeCash, treePaths, W_MAX} from "../index";
import * as path from "path";

/**
 * Функция для создания воркеров, кэширующих деревья
 * @param treeName идентификатор дерева
 */
export function createWorker(treeName: string): void {
  // проверяем количество запущенных воркеров или тот факт, что один из воркеров уже собирает данное дерево
  // @@@в задаче про это не сказано, но было бы глупо запустить сто воркеров на запуск первого дерева@@@
  if (appState.runningWorkers >= W_MAX || treeCash.isUpdating(treeName)) return

  // создаем воркер из js-оберки (нельзя создавать напрямую из файлов с расширением .ts)
  const worker = new Worker(path.join(process.cwd(), 'src', 'worker.js'), {
    workerData: {
      treeName,
      treePaths
    }
  });
  // при начале работы воркера меняем состояние приложения (кол-во запущенных воркеров)
  worker.on('online', () => {
    ++appState.runningWorkers
    treeCash.setUpdatingFlag(treeName)
  })
  // при завершении работы воркера меняем состояние приложения (кол-во запущенных воркеров)
  worker.on('exit', () => {
    --appState.runningWorkers
  })
  worker.on('message', async tree => {
    console.log(tree.cash)
    treeCash.setTree(treeName, tree)
  })
}