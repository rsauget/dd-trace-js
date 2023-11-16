'use strict'

function vulnerableFind (mquery, collection, filter, cb) {
  return mquery()
    .find(filter)
    .collection(collection)
    .then(cb).catch(cb)
}

function vulnerableFindOne (mquery, collection, filter, cb) {
  return mquery()
    .findOne(filter)
    .collection(collection)
    .then(cb).catch(cb)
}

module.exports = {
  vulnerableFind,
  vulnerableFindOne
}
