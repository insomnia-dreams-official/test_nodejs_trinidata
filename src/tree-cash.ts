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
 * При инициализации создает структуру TreeWithMetadataInterface для каждого дерева,
 * она нужна нам для хранения метаинформации по файлам и воркерам.
 */
export class TreeCash {
  private readonly trees: TreesInterface;

  constructor(options: OptionsInterface) {
    this.trees = {}
    // проинициализируем деревья и их метаданные
    for (const treeName in options.paths) {
      this.trees[treeName] = {
        fileUpdateDate: null, // дата обновления файла
        cashUpdateDate: null, // дата последнего отработавшего воркера
        isUpdating: false,    // флаг показывающий, работает ли воркер в данный момент
        path: options.paths[treeName], // путь к файлу
        cash: null,           // закэшированный объект дерева
      }
    }
  }

  /**
   * Метод возвращает закэшированное дерево
   * @param treeName идентификатор дерева
   */
  public getCashedTree(treeName: string): any {
    return this.trees[treeName].cash
  }

  /**
   * Метод возвращает true, если файл был обновлен после создания кэша на него
   * ***(при первом запуске тоже вернет true) currentFileUpdateDate > null это равенство всегда соблюдается
   * @param treeName идентификатор дерева
   */
  public isFileModified(treeName: string): boolean {
    // получаем дату обновления файла
    const {path, fileUpdateDate} = this.trees[treeName]
    // получаем дату текущего обновления файла
    const currentFileUpdateDate = fs.statSync(path).mtime;
    return currentFileUpdateDate > fileUpdateDate
  }

  /**
   * Метод возвращает кусочек нужного нам дерева с заданного элемента
   * @param treeName идентификатор дерева
   * @param id идентификатор элемента, с которого начинаем строить дерево
   */
  public async createTreeBranch(treeName: string, id: string): Promise<TreeInterface> {
    const treePath = this.trees[treeName].path

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
    return new Promise(((resolve) => {
        // запускаем стрим по csv файлу
        fs.createReadStream(treePath)
          // обрабатываем его csv-parser для получения объектов
          .pipe(csv())
          .on('data', (data: CsvData): void => {
            // создаем корневой элемент
            if (Number(data.id) === Number(id)) {
              const element = {
                id: data.id,
                name: data.name,
                children: null
              }
              cash[id] = element
            }
            // создаем потомков заданного элемента
            if (Number(data.id) > Number(id) && Number(data.parent) >= Number(id)) {
              /**
               * Обычно такие условия взрывают мозги, поэтому объясню, что я имел в виду.
               * 1) Number(data.id) > Number(id) -> data.id потомка всегда будет больше заданного (id).
               * 2) Number(data.parent) >= Number(id) -> у потомков data.parent будет равен id (его прямые дети),
               * либо будет больше заданного это дети его детей
               * @@@ разумеется, если записи в csv файле будут в случайном порядке, то такой подход не будет работать @@@
               */
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
                // а не null@@@
              }
            }
          })
          .on('end', () => {
            resolve(cash[id])
          })
          .on('error', error => {
            console.log(`Ошибка. При создании дерева ${treeName}`, error)
            resolve(null)
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

  /**
   * Метод говорит нам, запущен ли в текущий момент воркер на обновление кэша дерева
   * @param treeName идентификатор дерева
   */
  public isUpdating(treeName: string): boolean {
    return this.trees[treeName].isUpdating
  }

  /**
   * Метод проставляет флаг, сигнализирующий о запуске воркера на обновление кэша дерева
   * @param treeName идентификатор дерева
   * @param value значение
   */
  public setUpdatingFlag(treeName: string, value: boolean): void {
    this.trees[treeName].isUpdating = value
  }
}

