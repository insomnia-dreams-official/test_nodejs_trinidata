import {Worker} from "worker_threads"
import {appState, treeCash, treePaths, W_MAX} from "../index"
import * as path from "path"

/**
 * Функция для создания воркеров, кэширующих деревья
 * @param treeName идентификатор дерева
 */
export function createWorker(treeName: string): void {
  // проверяем количество запущенных воркеров
  if (appState.runningWorkers >= W_MAX) {
    console.log(`Задействовано максимальное количество воркеров ${W_MAX}`)
    return
  }

  // проверяем собирает ли один из воркеров данное дерево
  if (treeCash.isUpdating(treeName)) {
    console.log(`Воркер не был запущен. Система обновляет кэш для ${treeName} в данный момент`)
    return
  }

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
    treeCash.setUpdatingFlag(treeName, true)
  })
  // при завершении работы воркера меняем состояние приложения (кол-во запущенных воркеров)
  worker.on('exit', () => {
    --appState.runningWorkers
    treeCash.setUpdatingFlag(treeName, false)
  })

  // при ошибке в работе воркера меняем состояние приложения (кол-во запущенных воркеров)
  worker.on('error', error => {
    console.log(error)
    --appState.runningWorkers
    treeCash.setUpdatingFlag(treeName, false)
  })

  worker.on('message', async tree => {
    // если не смогли собрать дерево, то возвращаем null
    if (tree) {
      treeCash.setTree(treeName, tree)
    }
  })
}