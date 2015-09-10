/**
 * Provides a simple mechanism to pass data between a serial port and a
 * some different object
 */

import _ from 'lodash'

export default class MediatedWrite {

  constructor(ttychan) {
    this._tty = ttychan

    this._links = []
  }

  // stop using this writer, releasing control to whoever may chose
  release() {
    _.each(this._links, (link) => link.unlink())
  }

  write(buf) {
    this._tty.write(buf)
  }

  recv() {
    // no-op
  }

  // link a different emitter
  link(emitter, fromEmitter, toEmitter) {

    var unlink = []
    // setup calls from Emitter -> TTY
    _.each(fromEmitter, function(targetev, sourceev) {
      emitter.addListener(sourceev, targetev)
      unlink.push(() => emitter.removeListener(sourceev, targetev))
    })

    // setup calls from TTY -> Emitter
    _.each(toEmitter, function(targetev, sourceev) {
      var call = _.isFunction(targetev)
        ? targetev
        : function() { emitter.emit.apply(emitter, arguments); }

      this._tty.addListener(sourceev, call)
      unlink.push(function() { this._tty.removeListener(sourceev, call) }.bind(this))
    }.bind(this))

    this._links.push({
      emitter: emitter,
      from:    fromEmitter,
      to:      toEmitter,
      unlink:  function() {
        console.log('debug: unlinking emitter')
        _.each(unlink, (fun) => fun())
      }
    })
  }

  unlink(emitter) {
    _.each(_.where(this._links, {emitter: emitter}),
           (link) => link.unlink())

    this._links = _.reject(this._links, {emitter: emitter})
  }
}
