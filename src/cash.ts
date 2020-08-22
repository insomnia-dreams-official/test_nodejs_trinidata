import * as fs from 'fs'
import * as csv from 'csv-parser'

export interface CsvData {
  id: string
  name: string
  parent: string
}

interface OptionsInterface {
  paths: Record<string, string>
}

interface TreeInterface {
  id: string
  name: string
  children: Array<TreeInterface>
}

export interface TreeWithMetadataInterface {
  isUpdating: boolean
  path: string
  fileUpdateDate: Date
  cashUpdateDate: Date
  cash: {
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
export class TreeCash {
  private readonly trees: TreesInterface;

  constructor(options: OptionsInterface) {
    this.trees = {}
    // проинициализируем деревья и их метаданные
    for (const treeName in options.paths) {
      this.trees[treeName] = {
        fileUpdateDate: null,
        cashUpdateDate: null,
        isUpdating: false,
        path: options.paths[treeName],
        cash: {},
      }
    }
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
   *    ]
   *  }
   */
  public getCashedTree(treeName: string, id: string): TreeInterface {
    return this.trees[treeName]?.cash[id]
  }

  /**
   * Возвращает true, если файл был обновлен после создания кэша
   * @param treeName название дерева
   */
  public isFileModified(treeName: string): boolean {
    // получаем дату обновления файла
    const {path, fileUpdateDate} = this.trees[treeName]
    // получаем дату текущего обновления файла
    const currentFileUpdateDate = fs.statSync(path).mtime;
    return currentFileUpdateDate > fileUpdateDate
  }

  public async createTree(treeName: string, id: string): Promise<TreeInterface> {
    const treePath = this.trees[treeName].path
    // проверяем существование файла (бесшумно)
    if (!fs.existsSync(treePath)) return null

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

    const cash = {}
    return await new Promise(((resolve, reject) => {
        // создаем стрим по файлу
        fs.createReadStream(treePath)
          // обрабатываем его csv-parser для получения объектов
          .pipe(csv())
          .on('data', (data: CsvData): void => {
            if (Number(data.id) === Number(id)) {
              const element = {
                id: data.id,
                name: data.name,
                children: null
              }
              cash[id] = element
            }
            if (Number(data.id) > Number(id) && Number(data.parent) >= Number(id)) {
              const element = {
                id: data.id,
                name: data.name,
                children: null
              }
              // пишем элемент в кэш
              cash[data.id] = element

              // проверяем есть ли у элемента родители
              // @@@ Вторым условием проверяем записан ли родитель в кэш, если уверены в csv файлах, его можно не проверять.
              // Я имею в виду допущение про отфильтрованность, описанное выше.@@@
              if (data.parent && cash[data.parent]) {
                // находим ссылку на родительский элемент
                const parentElement = cash[data.parent]
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
            }
          })
          .on('end', () => {
            resolve(cash[id])
          })
          .on('error', error => {
            reject(null)
          })
      }
    ))
  }

  /**
   * Метод для записи закэшированного дерева
   * @param treeName идентификатор дерева
   * @param tree дерево с метаинформацией
   */
  public setTree(treeName: string, tree: TreeWithMetadataInterface): void {
    this.trees[treeName] = tree
  }

  public isUpdating(treeName: string): boolean {
    return this.trees[treeName].isUpdating
  }

  public setUpdatingFlag(treeName: string): void {
    this.trees[treeName].isUpdating = true
  }
}

