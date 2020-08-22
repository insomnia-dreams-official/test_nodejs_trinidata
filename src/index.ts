import * as express from 'express'
import * as bodyParser from 'body-parser'
import * as path from "path"
import {TreeCash} from "./cash"
import {createWorker} from "./utils/create-worker";
import {log} from "util";

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
  // пытаемся получить данные из кэша
  const element = treeCash.getCashedTree(treeName, id)
  if (element && !treeCash.isFileModified(treeName)) {
    // данные получены из кэша, возвращаем их
    res.json(element)
  } else {
    // данных не были получены, создаем воркер для кэширования дерева
    createWorker(treeName)
    // собираем дерево "на лету"
    const tree = await treeCash.createTree(treeName, id)
    res.json(tree)
  }
})

/**
 * Запускаем http server
 */
app.listen(PORT, () => console.log(`⚡️[server]: Server is running at https://localhost:${PORT}`))

// async function getData(urls) {
//   const promises = []
//   urls.forEach(url => {
//     promises.push(
//       // привел пример со сторонней библиотекой, нативные методы не так коротки
//       axios.get(url)
//         .then(r => r)
//         .catch(e => e)
//     )
//   })
//   const data = await Promise.all(promises)
//   // Здесь сделано допущение, что мы получили все данные правильно,
//   // в зависимости от http ответов на ошибки, и того как мы хотим их отобразить в результирующем объекте
//   // можно было бы дописать что-то еще
//   return Object.fromEntries(urls.map((url, idx) => [url, data[idx].status === 200 ? data[idx] : 'данные не были получены']))
// }


function fn(obj) {
  const someProp = obj.someProp
  return new Promise((resolve, reject) => {
    reject(someProp)
  })
}

async function asyncFn(obj) {
  const someProp = obj.someProp
  return Promise.reject(someProp)
}

(async ()=>{
  const o = {}
  await asyncFn(o).catch(err => console.error('Catched')) // => 'Catched'
  await fn(o).catch(err => console.error('Catched')) // => TypeError: Cannot read property 'someProp' of undefined
})()


