'use strict'

const ProducerPlugin = require('../../dd-trace/src/plugins/producer')

class KafkajsProducerPlugin extends ProducerPlugin {
  static get name () { return 'kafkajs' }
  static get operation () { return 'produce' }

  start ({ topic, messages }) {
    // TODO: Produce Checkpoint
    const existingSpan = someHowGetTheSpanWereIn('kafka.consume') // TODO: is this possible?

    const currentTimeNs = Date.now() * 1000

    if (existingSpan) {
      someData = doSomethingWithTheStuff(existingSpan._checkpointHash)
    }

    const span = this.startSpan('kafka.produce', {
      service: this.config.service || `${this.tracer._service}-kafka`,
      resource: topic,
      kind: 'producer',
      meta: {
        'component': 'kafkajs',
        'kafka.topic': topic
      },
      metrics: {
        'kafka.batch_size': messages.length
      }
    })

    for (const message of messages) {
      if (typeof message === 'object') {
        this.tracer.inject(span, 'text_map', message.headers)
        message.headers['dd-pathway-ctx'] = someData + currentTimeNs
      }
    }
  }
}

function getCheckpointString(group, topic, partition) {
  return `direction:outgroup:${group}partition:${partition}topic:${topic}type:kafka`;
}

module.exports = KafkajsProducerPlugin
