import * as path from 'path'
import * as fs from 'fs'
import * as csv from 'csv-parser'

interface CsvData {
  id: string
  name: string
  parent: string
}

interface TreeCashOptions {
  paths: Array<string>
}

interface TreeInterface {
  id: string
  name: string
  children: Array<TreeInterface>
}

interface TreeWithMetadataInterface {
  isUpdating: boolean
  path: string
  lastUpdate: Date
  json: {
    [id: string]: TreeInterface
  }
}

interface TreesInterface {
  [treeName: string]: TreeWithMetadataInterface
}

/**
 * Класс для кэширования деревьев из csv файлов.
 * Принимает массив из путей файлов и создает структуру TreeInterface для каждого из них.
 * Обратиться к данной структуре можно через имя, которое совпадает с последней частью переданного пути (без расширения).
 *  Пример:
 *  trees.tree1 <-- тут будет храниться кэш и метаинформация
 * @@@ Не стал делать эти структуры через литералы, ведь деревьев может быть и миллион.
 * Для инициализации сделаем метод updateCash, он будет пробегать по путям из конструктора и обновлять объект trees
 */
class TreeCash {
  private trees: TreesInterface;
  private readonly treePaths: Array<string>;

  constructor(options: TreeCashOptions) {
    this.trees = {}
    this.treePaths = options.paths
  }

  /**
   * Метод обновляющий кэши деревьев по списку файлов (список задается через конструктор)
   */
  public async updateCash(): Promise<void> {
    for (const treePath of this.treePaths) {
      // проверяем существование файла (бесшумно)
      if (!fs.existsSync(treePath)) continue

      // получаем имя дерева и создаем объект с его метаинформацией его
      const treeName = path.basename(treePath, '.csv');
      this.trees[treeName] = {
        isUpdating: true,
        path: treePath,
        lastUpdate: null,
        json: {},
      }
      console.log(`Система собирает кэш для дерева ${treePath}`)
      // запускаем стрим по csv файлу (не будем закидывать его в память полностью, он может быть гигабайтным)
      // @@@
      // Допущением является то, что записи отфильтрованы в csv файле, это значит чтобы
      // собрать дерево нам понадобится только один проход. Если они не отфильтрованы,
      // то либо нужно грузить все в оперативную память и фильтровать;
      // либо грузиться все в какое-то хранилище (mongo/postgres) и фильтровать там.
      // Под "фильтрованностью" понимается то, что когда мы читаем запись из csv файла все ее родители
      // уже записаны нами в кэш, и мы просто добавляем ее как "лист" дерева.
      // В противном случае мы просто обратимся к несуществующему ключу (undefined).
      // @@@

      const tree = this.trees[treeName]
      await new Promise(((resolve, reject) => {
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
            tree.json[data.id] = element

            // проверяем есть ли у элемента родители
            // @@@ вторым условием проверяем записан ли родитель в кэш, если уверены в csv файлах, его можно не проверять
            if (data.parent && tree.json[data.parent]) {
              // находим ссылку на родительский элемент
              const parentElement = tree.json[data.parent]
              // закидываем текущий элемент в родительский массив
              if (!Array.isArray(parentElement.children)) {
                // создаем новый массив
                parentElement.children = [element]
              } else {
                // добавляем в массив с уже добавленными детьми
                parentElement.children.push(element)
              }
              // @@@вложенных условий можно было бы избежать, если в "листьях" можно было бы хранить пустой массив,
              //а не null
            }
          })
          .on('end', () => {
            // меняем флажок isUpdating
            tree.isUpdating = false
            resolve()
          })
          .on('error', error => {
            reject(error)
          })
      }))
        .catch(error => {
          console.log(`Ошибка. Система не смогла собрать кэш для файла ${treeName}.`, error)
        })
    }
    // @@@ тут сделана последовательная реализация (for of), можно было бы сделать через Promise.all,
    //минус вижу в том, что при большом объеме данных: мы будем долго ждать пока соберутся все деревья,
    //и будем сосать лапу вообще без кэша. А так они не зависимы и пока собирается 2,3...n.
    // Мы можем использовать первое (оно уже собрано)
  }

  /**
   * Метод возвращает кусочек нужного нам дерева с заданного элемента
   * @param treeName закешированное дерево
   * @param id идентификатор элемента, с которого начинаем строить дерево
   * Пример:
   * {
   *    id: '4',
   *    name: 'мыло жидкое “help”',
   *    children: [
   *      { id: '5', name: 'мыло жидкое “help” для мужчин', children: null },
   *      {
   *        id: '6',
   *        name: 'мыло жидкое “help” для женщин',
   *        children: [Array]
   *      }
   *    ]
   *  }
   */
  public getTreeElement(treeName: string, id: string): TreeInterface {
    return this.trees[treeName]?.json[id]
  }
}

const treeCashOptions = {
  paths: [
    path.join(process.cwd(), 'files', 'tree1.csv'),
    path.join(process.cwd(), 'files', 'tree2.csv'),
    path.join(process.cwd(), 'files', 'tree3.csv'),
  ]
}
async function main() {
  const treeCash = new TreeCash(treeCashOptions)
  await treeCash.updateCash()
  console.log(treeCash.getTreeElement('tree1', '4'))
}

main()