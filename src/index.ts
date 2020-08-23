import * as fs from "fs"
import * as express from "express"
import * as bodyParser from "body-parser"
import * as path from "path"
import {TreeCash} from "./tree-cash"
import {createWorker} from "./utils/create-worker"

/**
 * Переменные проекта
 */
const PORT = process.env.HTTP_PORT || 8000
export const W_MAX = process.env.W_MAX ?? 100 // вдруг мы захотим передать 0 (вообще не будем ничего кэшировать)
export const appState = {
  runningWorkers: 0
}
export const treePaths = {
  tree1: path.join(process.cwd(), 'files', 'tree1.csv'),
  tree2: path.join(process.cwd(), 'files', 'tree2.csv'),
  tree3: path.join(process.cwd(), 'files', 'tree3.csv'),
}

/**
 * Создаем инстанс express и подключаем нужные middleware
 */
const app = express()
app.use(bodyParser.json());

/**
 * Создаем класс для работы с кэшамим деревьев
 */
export const treeCash = new TreeCash({paths: treePaths})

app.post('/tree', async (req, res) => {
  const {tree: treeName, id} = req.body

  // такое надо проверять, чем нибудь вроде joy, но не будем переусложнять тестовый проект
  if (isNaN(id)) {
    return res.json({
      error: `Ошибка. Поле id должно быть числом, получено "${id}"`
    })
  }

  // проверяем существование файла (в принципе такие проверки можно выносить в мидлы, если их много (проверок))
  if (!fs.existsSync(treePaths[treeName])) {
    return res.json({
      error: `Ошибка. Система не смогла собрать кэш для файла "${treeName}.csv", потому что такого файла не существует`
    })
  }

  // пытаемся получить данные из кэша
  const cashedTree = treeCash.getCashedTree(treeName)
  /**
   * Почему мы получаем все дерево, а не ветку? Если идентификатор id будет out of range
   * мы будем получать cashedTree=undefined, и запускать воркер. Хотя фактически дерево уже закэшированно.
   */
  if (cashedTree && !treeCash.isFileModified(treeName)) {
    // данные получены из кэша, возвращаем их
    console.log(`Данные получены из кэша для ${treeName}`) // дебаговые логи
    res.json(
      cashedTree[id] ?
        {tree: cashedTree[id]} :
        {error: `Ошибка. Идентификатора "${id}" для дерева "${treeName}" не существует.`}
    )
  } else {
    // данных не были получены, создаем воркер для кэширования дерева
    createWorker(treeName)
    // собираем дерево "на лету"
    const treeBranch = await treeCash.createTreeBranch(treeName, id)
    console.log(`Данные собраны на лету для ${treeName}`) // дебаговые логи
    res.json(
      treeBranch ?
        {tree: treeBranch} :
        {error: `Ошибка. Идентификатора "${id}" для дерева "${treeName}" не существует.`}
    )
  }
})

/**
 * Запускаем http server
 */
app.listen(PORT, () => console.log(`⚡️[server]: Server is running at https://localhost:${PORT}`))