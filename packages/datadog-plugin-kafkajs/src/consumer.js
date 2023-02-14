'use strict'

const ConsumerPlugin = require('../../dd-trace/src/plugins/consumer')

class KafkajsConsumerPlugin extends ConsumerPlugin {
  static get name () { return 'kafkajs' }
  static get operation () { return 'consume' }

  start ({ topic, partition, message }) {
    // TODO: Consume Checkpoint
    const childOf = extract(this.tracer, message.headers)

    const checkpointString = getCheckpointString('TODO', topic, partition)

    const parentTimestamp = getParentTImestamp(message.headers)

    const checkpointHash = getCheckpointHash(checkpointString)

    const currentTimeNs = Date.now() * 1000

    this.startSpan('kafka.consume', {
      childOf,
      service: this.config.service || `${this.tracer._service}-kafka`,
      resource: topic,
      kind: 'consumer',
      type: 'worker',
      meta: {
        'component': 'kafkajs',
        'kafka.topic': topic,
        'kafka.message.offset': message.offset
      },
      metrics: {
        'kafka.partition': partition
      },
      _checkpointHash: checkpointHash,
      _parentTimestamp: parentTimestamp
    })
  }
}

function extract (tracer, bufferMap) {
  if (!bufferMap) return null

  const textMap = {}

  for (const key of Object.keys(bufferMap)) {
    textMap[key] = bufferMap[key].toString()
  }

  return tracer.extract('text_map', textMap)
}

function getCheckpointString(group, topic, partition) {
  return `direction:ingroup:${group}partition:${partition}topic:${topic}type:kafka`;
}

module.exports = KafkajsConsumerPlugin
