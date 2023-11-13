class Mask {
  constructor (filterString) {
    this._filterString = filterString
    const rules = this.parseRules(filterString)
    this._root = new MaskNode(
      'root',
      { isDeselect: true, isRoot: true }
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
    const localRoot = new MaskNode(keys[0], { isDeselect })
    let head = localRoot
    for (const key of keys.slice(1)) {
      head = head.addChild(new MaskNode(key, { isDeselect, children: new Map() }))
    }
    head.addChild(new MaskNode('*', { isDeselect, children: new Map() }))
    return localRoot
  }

  showTree () { return this._root.showTree() }
}

class MaskHead {
  constructor (mask, prev, head = null) {
    this._mask = mask
    this._prev = prev
    this._head = head === null ? mask._root : head
  }

  withNext (key) {
    return new MaskHead(this._mask, this._head, this._head.next(key))
  }

  canTag () { return this._head.canTag(...arguments, this._prev) }
}

class MaskNode {
  constructor (key, { isDeselect, children, isRoot = false }) {
    this.name = key
    this._parent = undefined
    this._isDeselect = isDeselect
    this._children = children || new Map()
    this._isRoot = isRoot
  }

  get isLeaf () { return this._children.size === 0 }

  get isGlob () { return this.name === '*' }

  get globChild () { return this.getChild('*') }

  addChild (node) {
    const myChild = this._children.get(node.name)
    if (myChild === undefined) {
      node._parent = this
      this._children.set(node.name, node)
      return node
    } else {
      for (const child of node._children.values()) {
        myChild.addChild(child)
      }
      return myChild
    }
  }

  getChild (key) { return this._children.get(key) }

  next (key) {
    const nextNode = this.getChild(key)
    if (nextNode === undefined) {
      if (this.globChild) return this.globChild
    }
    return nextNode
  }

  canTag (key, isLast) {
    const node = this.next(key)
    console.log(`context ${this}: child node ${node} for ${key}`)
    if (node === undefined) {
      if (this.isGlob && this.isLeaf) {
        console.log(`undef ${!this._isDeselect}`)
        return !this._isDeselect
      }
      const isIncludingPath = !this._isDeselect
      console.log(`undef incl path ${isIncludingPath}`)
      if (isIncludingPath) {
        // If we are in an including path and we haven't found the tag,
        // then we're not included
        return false
      } else {
        // We're in the root, which should never select anything
        if (this._isRoot) return false
        // Otherwise, we're in an excluding path and we haven't found it,
        // so we're included
        return true
      }
    } else {
      if (isLast) {
        if (node.isLeaf || (node._children.size === 1 && node.globChild?.isLeaf)) {
          console.log(`last and leaf ${!node._isDeselect}`)
          return !node._isDeselect
        }
      }
      return true
    }
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

module.exports = { Mask, MaskNode, MaskHead }
