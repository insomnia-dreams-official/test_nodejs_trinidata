import {parentPort, workerData} from 'worker_threads';
import * as fs from "fs";
import * as csv from "csv-parser";
import {CsvData, TreeWithMetadataInterface} from "./cash";

export async function main() {
  const {treeName, treePaths} = workerData
  const tree = await createTree(treeName, treePaths)
  parentPort.postMessage(tree);
}

main()

/**
 * Функция для сборки дерева по заданному идентификатору
 * @param treeName идентификатор дерева
 */
async function createTree(treeName: string, treePaths: Record<string, string>): Promise<TreeWithMetadataInterface> {
  const treePath = treePaths[treeName]
  // проверяем существование файла
  if (!fs.existsSync(treePath)) {
    console.log(`Ошибка. Система не смогла собрать кэш для файла ${treeName}.csv, потому что его не существует`)
    return null
  }

  console.log(`Система собирает кэш для дерева ${treePath}`)
  const tree = {
    fileUpdateDate: fs.statSync(treePath).mtime,
    cashUpdateDate: null, // заполняем при в exit коллбэке
    isUpdating: false, // сразу взводим флаг для метода treeCash.setTree()
    path: treePath,
    cash: {},
  }
  // запускаем стрим по csv файлу (не будем закидывать его в память полностью)
  // @@@
  // Допущением является то, что записи отфильтрованы в csv файле, это значит чтобы
  // собрать дерево нам понадобится только один проход. Если они не отфильтрованы,
  // то либо нужно грузить все в оперативную память и фильтровать;
  // либо грузиться все в какое-то хранилище (mongo/postgres) и фильтровать там.
  // Под "фильтрованностью" понимается то, что когда мы читаем запись из csv файла все ее родители
  // уже записаны нами в кэш, и мы просто добавляем ее как "лист" дерева.
  // В противном случае мы просто обратимся к несуществующему ключу (undefined).
  // @@@

  return await new Promise(((resolve) => {
    // создаем стрим по файлу
    fs.createReadStream(treePath)
      // обрабатываем его csv-parser для получения объектов
      .pipe(csv())
      .on('data', (data: CsvData): void => {
        // собираем текущий элемент (соответствует данной строке)
        const element = {
          id: data.id,
          name: data.name,
          children: null
        }
        // пишем элемент в кэш
        tree.cash[data.id] = element

        // проверяем есть ли у элемента родители
        // @@@ Вторым условием проверяем записан ли родитель в кэш, если уверены в csv файлах, его можно не проверять.
        // Я имею в виду допущение про отфильтрованность, описанное выше.@@@
        if (data.parent && tree.cash[data.parent]) {
          // находим ссылку на родительский элемент
          const parentElement = tree.cash[data.parent]
          // закидываем текущий элемент в родительский массив
          if (!Array.isArray(parentElement.children)) {
            // создаем новый массив
            parentElement.children = [element]
          } else {
            // добавляем в массив с уже добавленными детьми
            parentElement.children.push(element)
          }
          // @@@вложенных проверок можно было бы избежать, если в "листьях" можно было бы хранить пустой массив,
          //а не null@@@
        }
      })
      .on('end', () => {
        tree.cashUpdateDate = new Date()
        resolve(tree)
      })
      .on('error', error => {
        console.log(`Ошибка. Система не смогла собрать кэш для файла ${treeName}.`, error)
        resolve(null)
      })
  }))
}