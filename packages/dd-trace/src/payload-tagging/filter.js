/**
 * A filter for the Payload Tagging DSL.
 *
 * @property {FilterItem} root
 */
class Filter {
  constructor (filterString) {
    const rules = this.parseFilterString(filterString)
    // With a glob, the root accepts everything.
    const isExcludingRoot = !filterString.startsWith('*')
    this._root = new FilterItem('root', isExcludingRoot)
    this.ingestRules(rules)
  }

  get root () { return this._root }

  parseFilterString (filterString) {
    if (filterString.startsWith('*')) {
      // This also covers an input of `*`
      const rules = filterString.slice(2).split(',')
      return rules
        .filter(rule => rule.length > 0)
    } else {
      return filterString.split(',').filter(rule => rule.length > 0)
    }
  }

  ingestRules (rules) {
    const [excludingRules, includingRules] = [[], []]
    for (const rule of rules) {
      if (rule.startsWith('-')) {
        excludingRules.push(rule)
      } else {
        includingRules.push(rule)
      }
    }

    for (const rule of includingRules) {
      let head = this._root
      for (const key of rule.split('.')) {
        head = head.add(new FilterItem(key, false))
      }
    }

    const exclItems = new FilterItem('ExclRoot', true)
    for (const rule of excludingRules) {
      let head = exclItems
      for (const key of rule.slice(1).split('.')) {
        head = head.add(new FilterItem(key, true))
      }
    }

    for (const exclHead of exclItems._children.values()) {
      this._root.add(exclHead)
    }
  }
}

/**
 * A filter item
 *
 * @property {string} name
 * @property {boolean} _isExcluding
 * @property {Map<string,FilterItem>} _children
 */
class FilterItem {
  constructor (key, isExcluding) {
    this.name = key
    this._isExcluding = isExcluding
    this._children = new Map()
  }

  get isLeaf () { return this._children.size === 0 }

  makeExclusive () {
    this._isExcluding = true
    this._children.clear()
  }

  /**
   * Add a node to our children
   * @param {FilterItem} node
   * @returns {FilterItem} The child node after addition
   */
  add (node) {
    const ourNode = this._children.get(node.name)
    if (ourNode === undefined) {
      this._children.set(node.name, node)
    } else {
      ourNode.merge(node)
    }
    return this._children.get(node.name)
  }

  /**
   * Merge another node to ourself: children and exclusive status
   * @param {FilterItem} other
   * @returns {FilterItem} Ourself
   */
  merge (other) {
    // We hit an excluding leaf, so there's no need to conserve anything beyond this node
    if (other.isLeaf && other._isExcluding) {
      this.makeExclusive()
      this._children.clear()
    } else {
      for (const child of other._children.values()) {
        this.add(child)
      }
    }
    return this
  }

  /**
   * Are we allowed to tag the given key, given available children
   * @param {string} key
   * @returns {boolean}
   */
  canTag (key) {
    // Edge case: we need to know what to do with keys when we're at the Filter root
    if (this.isLeaf) {
      return !this._isExcluding
    }
    const child = this._children.get(key)
    if (child === undefined) {
      return !this._isExcluding
    }
    if (child.isLeaf) {
      return !child._isExcluding
    }
    return true
  }

  next (key) {
    return this._children.get(key) || new AlwaysFilter(this._isExcluding)
  }
}

/**
 * A filter item that always replies the same to `canTag`.
 * When we exhaust a filter path, this replies the same as the last available
 * item, and it resets itself as the next available filter item.
 */
class AlwaysFilter {
  constructor (isExclusive) {
    this._canTag = !isExclusive
  }

  canTag () { return this._canTag }

  next () { return this }
}

module.exports = { Filter, FilterItem }
