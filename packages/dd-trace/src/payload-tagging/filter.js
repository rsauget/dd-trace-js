class Mask {
  constructor (filterString) {
    const rules = this.parseRules(filterString)
    this._isGlob = filterString.startsWith('*')
    this._root = new MaskNode(
      'root',
      this,
      {
        isDeselect: false, isGlob: filterString.startsWith('*')
      }
    )
    for (const rule of rules) {
      const chain = this.makeChain(rule)
      this._root.addChild(chain)
    }
  }

  get root () { return this._root }

  splitUnescape (input, separator) {
    const escapedSep = `\\${separator}`
    const rules = []
    for (let i = 0; i < input.length;) {
      let nextSep = input.indexOf(separator, i)
      while (nextSep >= 0 && input[nextSep - 1] === '\\') {
        nextSep = input.indexOf(separator, nextSep + 1)
      }
      if (nextSep === -1) {
        rules.push(input.slice(i).replaceAll(escapedSep, separator))
        break
      } else {
        rules.push(input.slice(i, nextSep).replaceAll(escapedSep, separator))
        i = nextSep + 1
      }
    }
    return rules
  }

  parseRules (filterString) {
    //    if (filterString.startsWith('*')) {
    //      filterString = filterString.slice(2)
    //    }
    return this.splitUnescape(filterString, ',')
  }

  parseRule (ruleString) {
    return this.splitUnescape(ruleString, '.')
  }

  makeChain (rule) {
    const isDeselect = rule.startsWith('-')
    if (isDeselect) {
      rule = rule.slice(1)
    }
    const keys = this.parseRule(rule)
    const root = new MaskNode(keys[0], this, { isDeselect })
    let head = root
    for (const key of keys.slice(1)) {
      const child = new MaskNode(key, this, { isDeselect, children: new Map() })
      head._children.set(key, child)
      head = child
    }
    return root
  }

  showTree () { return this._root.showTree() }
}

class MaskNode {
  constructor (key, mask, { isDeselect, children }) {
    this.name = key
    this._mask = mask
    this._isDeselect = isDeselect
    this._children = children || new Map()
  }

  get isLeaf () { return this._children.size === 0 }

  get childIsGlob () { return this._children.size === 1 && this._children.get('*') !== undefined }

  addChild (node) {
    if (node.isLeaf) {
      this._children.set(node.name, node)
      return
    }

    const myChild = this._children.get(node.name)
    if (myChild === undefined) {
      this._children.set(node.name, node)
    } else {
      for (const child of node._children.values()) {
        myChild.addChild(child)
      }
    }
  }

  next (key) {
    const nextNode = this._children.get(key)
    if (nextNode === undefined) {
      if (this.childIsGlob) return this._children.get('*')
      return new EndNode(!this._isDeselect, this._mask)
    }
    return nextNode
  }

  canTag (key) {
    if (this.childIsGlob) { return true }
    if (this.isLeaf) { return !this._isDeselect }
    const node = this._children.get(key)
    console.log(`child node ${node} for ${key} from ${this}`)
    if (node === undefined) {
      console.log(`undef for ${key} ${this._isDeselect}`)
      return this._isDeselect
    }
    if (node.isLeaf) return !node._isDeselect
    return true
  }

  toString () {
    return JSON.stringify({
      name: this.name,
      isDeselect: this._isDeselect,
      children: Array.from(this._children.keys())
    })
  }

  showTree (indent = 0) {
    const indentStr = ' '.repeat(indent)
    console.log(`${indentStr}${this}`)
    for (const child of this._children.values()) {
      child.showTree(indent + 2)
    }
  }
}

class EndNode {
  constructor (canTag, mask) {
    this._canTag = canTag
    this._mask = mask
  }

  canTag () { return this._canTag }

  next () { return this }

  toString () { return `EndNode {canTag: ${this._canTag}}` }

  showTree (indent = 0) { return `${' '.repeat(indent)}${this.toString()}` }
}

/**
 * A filter for the Payload Tagging DSL.
 *
 * @property {FilterItem} root
 */
class Filter {
  constructor (filterString) {
    const rules = this.parseRules(filterString)
    // With a glob, the root accepts everything.
    const isExcludingRoot = !filterString.startsWith('*')
    this._root = new FilterItem('root', isExcludingRoot)
    this.ingestRules(rules)
  }

  get root () { return this._root }

  splitUnescape (input, separator) {
    const escapedSep = `\\${separator}`
    const rules = []
    for (let i = 0; i < input.length;) {
      let nextSep = input.indexOf(separator, i)
      while (nextSep >= 0 && input[nextSep - 1] === '\\') {
        nextSep = input.indexOf(separator, nextSep + 1)
      }
      if (nextSep === -1) {
        rules.push(input.slice(i).replaceAll(escapedSep, separator))
        break
      } else {
        rules.push(input.slice(i, nextSep).replaceAll(escapedSep, separator))
        i = nextSep + 1
      }
    }
    return rules
  }

  parseRules (filterString) {
    if (filterString.startsWith('*')) {
      filterString = filterString.slice(2)
    }
    return this.splitUnescape(filterString, ',')
  }

  parseRule (ruleString) {
    return this.splitUnescape(ruleString, '.')
  }

  ingestRules (rules) {
    const [excludingRules, includingRules] = [[], []]
    for (const rule of rules) {
      if (rule.startsWith('-')) {
        excludingRules.push(this.parseRule(rule.slice(1)))
      } else {
        includingRules.push(this.parseRule(rule))
      }
    }

    for (const rule of includingRules) {
      let head = this._root
      for (const key of rule) {
        head = head.add(new FilterItem(key, false))
      }
    }

    const exclItems = new FilterItem('ExclRoot', true)
    for (const rule of excludingRules) {
      let head = exclItems
      for (const key of rule) {
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

  toString () {
    return JSON.stringify({
      name: this.name,
      isExcluding: this._isExcluding,
      children: Array.from(this._children.keys())
    })
  }

  static showTree (node, indent = 0) {
    const indentStr = ' '.repeat(indent)
    console.log(`${indentStr}${node}`)
    if (node instanceof AlwaysFilter || node === undefined) return
    for (const child of node._children.values()) {
      this.showTree(child, indent + 2)
    }
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

  toString () { return JSON.stringify({ CanTag: this._canTag }) }
}

module.exports = { Filter, FilterItem, Mask, MaskNode }
