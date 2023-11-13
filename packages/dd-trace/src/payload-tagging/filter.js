class Mask {
  /**
   * The mask to apply to JSON objects
   *
   * @param {string} filterString
   */
  constructor (filterString) {
    this._filterString = filterString
    this._root = new MaskNode(
      'root',
      { isDeselect: true, isRoot: true }
    )

    for (const rule of this.parseRules(filterString)) {
      const chain = this.makeChain(rule)
      this._root.addChild(chain)
    }
  }

  /**
   * Split the input according to a given separator, taking into account
   * escaped instances of the separator
   *
   * @param {string} input
   * @param {string} separator
   * @returns {string} an unescaped copy of the input.
   */
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

  /**
   * Build a tree representation of a single rule.
   *
   * @param {string} rule
   * @returns {MaskNode} the root node representation of the rule.
   */
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
}

class MaskHead {
  /**
   * A head-tracking helper for iterating recursively through a mask tree.
   *
   * @param {Mask} mask
   * @param {MaskNode} head
   */
  constructor (mask, head = null) {
    this._mask = mask
    this._head = head === null ? mask._root : head
  }

  /**
   *
   * @param {string} key
   * @returns {MaskNode | undefined}
   */
  withNext (key) {
    return new MaskHead(this._mask, this._head.next(key))
  }

  canTag () { return this._head.canTag(...arguments) }
}

class MaskNode {
  /**
   * A node of the JSON mask tree
   *
   * @param {string} key
   * @param {object} options
   * @param {boolean} options.isDeselect
   * @param {boolean} options.isRoot
   */
  constructor (key, { isDeselect, isRoot = false }) {
    this.name = key
    this._isDeselect = isDeselect
    this._children = new Map()
    this._isRoot = isRoot
  }

  get isLeaf () { return this._children.size === 0 }

  get isGlob () { return this.name === '*' }

  get globChild () { return this.getChild('*') }

  addChild (node) {
    const myChild = this.getChild(node.name)
    if (myChild === undefined) {
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

  /**
   * Get the child node corresponding to a
   *
   * @param {string} key
   * @returns {MaskNode | undefined}
   */
  next (key) {
    const nextNode = this.getChild(key)
    if (nextNode === undefined) {
      if (this.globChild) return this.globChild
    }
    return nextNode
  }

  canTag (key, isLast) {
    const node = this.next(key)
    if (node === undefined) {
      if (this.isGlob && this.isLeaf) {
        return !this._isDeselect
      }
      const isIncludingPath = !this._isDeselect
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
      // Unless we've reached the end of the object we're currently masking, we
      // can keep going.
      if (isLast) {
        if (node.isLeaf || (node._children.size === 1 && node.globChild?.isLeaf)) {
          return !node._isDeselect
        }
      }
      return true
    }
  }
}

module.exports = { Mask, MaskNode, MaskHead }
