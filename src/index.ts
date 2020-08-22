import * as express from 'express'
import * as bodyParser from 'body-parser'
import * as path from "path"
import {TreeCash} from "./cash"
import {createWorker} from "./utils/create-worker";

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

app.post('/tree', (req, res) => {
  const {tree, id} = req.body
  // пытаемся получить данные из кэша
  const element = treeCash.getCashedTreeElement(tree, id)
  if (element && !treeCash.isFileModified(tree)) {
    // данные получены из кэша, возвращаем их
    res.json(element)
  } else {
    // данных не были получены, создаем воркер для кэширования дерева
    createWorker(tree)
    // собираем дерево "на лету"
    console.log(appState)
    res.json({tree: {}})
  }
})

app.listen(PORT, () => console.log(`⚡️[server]: Server is running at https://localhost:${PORT}`))