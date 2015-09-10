/**
 * Mechanism to synchronously communicate with the serial port
 * it does so by exclusively "locking" the serial port IO.
 */

import _ from 'lodash'

export default class SyncWrite {

  constructor(ttychan) {
    this._tty = ttychan
    this._tty.addListener('data', this.handleData.bind(this))

    this._queue = [] // [ [Buffer, Fun | RegExp | Buffer | null, timeout | null] ]
    this._head = undefined // undefined || [Buffer, Fun | RegExp | Buffer | null, timeout | nul]
  }

  handleData(buf) {
    if (undefined === this._head)
      return

    if (undefined === this._head[1]) {
      this.processQueue()
      return
    }

    if (_.isRegExp(this._head[1])) {
      if (buf.match(this._head[1])) {
        this._head = undefined
      }
    } else if(_.isFunction(this._head[1])) {
      if (this._head[1](buf))
        this._head = undefined
    } else {
      if (0 === Buffer.compare(buf, this._head[1])) {
        this._head = undefined
      }
    }

    if (undefined === this._head)
      this.processQueue()
  }

  // stop using this writer, releasing control to whoever may chose
  release() {
    this._tty.removeListener('data', this.handleData)
  }

  write(buf, resp, timeout) {
    if (_.isString(resp))
      resp = new Buffer(resp)

    this._queue.push([buf, resp, timeout])

    if (undefined === this._head)
      this.processQueue()

    return this._queue.length
  }

  // peek at what is being written
  peek() {
    return this._head
  }

  processQueue() {
    this._head = this._queue.shift()

    if (undefined === this._head)
      return

    this._tty.write(this._head[0])
  }
}
