/**
 * wrapper for net.Socket
 */

import net from 'net'

import Q from 'q'
import _ from 'lodash'

export default class TcpChannel {
  constructor(opts, onData, onStateChange) {
    this._opts = _.defaults(opts || {}, {
      host: 'tcp.cloud.tiny-mesh.com',
      port: 7001
    })

    this._socket = undefined
    this._opening = false
    this._onData = onData
    this._onStateChange = onStateChange
  }

  stateChange() {
    if (this._onStateChange)
      this._onStateChange()
  }

  onData(buf) {
    if (this._onData)
      this._onData(buf, 'upstream')
    else
      console.log("ERROR no handler for TcpChannel.onData, specify onData when creating object")
  }

  connected() {
    return undefined !== this._socket
  }

  connect() {
    if (false !== this._opening)
      return this._opening

    var defered = Q.defer()

    if (this.connected()) {
      this.stateChange()
      defered.resolve()
      return defered.promise
    }

    this._opening = defered.promise
    this._socket = net.connect(this._opts.port, this._opts.host)

    var errHandler
    this._socket.once('error', errHandler = function(err) {
      this._opening = false
      this._socket = undefined
      defered.reject({error: err.toString(), host: this._opts.host, port: this._opts.port})
    }.bind(this))

    this._socket.on('connect', function() {
      console.log('debug: tcpchan/open')
      this._socket.removeListener('error', errHandler)

      this._socket.on('data', this.onData.bind(this))
      this._socket.on('close', function() {
        console.log('debug: tcpchan/close')
        // might be ended some other way, make sure we disconnect
        this.disconnect()
      }.bind(this))

      this._opening = false

      this._socket.on('end', function(err) {
        this._socket = undefined
        this.stateChange()
      }.bind(this))

      this._socket.on('error', function(err) {
        console.log('debug: tcpchan/err', err)
        this.stateChange()
      }.bind(this))

      defered.resolve()
    }.bind(this))

    return defered.promise
  }

  disconnect() {
    if (!this._socket)
      return {error: "socket not-open"}

    var defered = Q.defer()

    var errHandler, disconnectHandler
    this._socket.end()

    this._socket.once('end', disconnectHandler = function() {
      console.log('debug: tcpchan/end')

      if (this._socket)
        this._socket.removeListener('error', errHandler)

      console.log('changing state/end')
      this.stateChange()
      defered.resolve()
      this._socket = undefined
    }.bind(this))

    this._socket.once('error', errHandler = function(err) {
      console.log('debug: tcpchan/startup-err', err)
      this._socket.removeListener('end', disconnectHandler)
      this._socket = undefined

      console.log('changing state/err')
      this.stateChange()

      defered.reject(err)
    }.bind(this))

    return defered.promise
  }

  addListener(ev, handler) {
    return this._socket.addListener(ev, handler)
  }

  removeListener(ev, handler) {
    if (this._socket)
      return this._socket.removeListener(ev, handler)
  }

  write(buf) {
    try {
      console.log('tcp/send', buf)
      return this._socket.write(buf)
    } catch(e) {
      console.log(e.stack)
    }
  }
}
