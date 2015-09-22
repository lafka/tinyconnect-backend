/**
 * Client's backend implementation for websockets API
 */

import SockJS from 'sockjs-client'
import {EventEmitter} from 'events'
import Q from 'q'

import Crypto from './crypto'

require('file?context=html&name=[path][name].[ext]!../html/index.html')
require('file?context=html&name=[path][name].[ext]!../html/404.html')
require('file?context=html&name=[path][name].[ext]!../html/missing-frontend.html')
require('file?context=html&name=[path][name].[ext]!../html/images/branding.png')
require('file?context=html&name=[path][name].[ext]!../html/images/branding-neg.png')

export default class SockJSBackend {
  constructor(opts) {
    opts = opts || {}
    this._emitter = new EventEmitter()

    // the lol way of extending......
    this.on                 = this._emitter.on.bind(this._emitter)
    this.once               = this._emitter.once.bind(this._emitter)
    this.removeListener     = this._emitter.removeListener.bind(this._emitter)
    this.removeAllListeners = this._emitter.removeAllListeners.bind(this._emitter)
    this.listeners          = this._emitter.listeners.bind(this._emitter)
    this.emit               = this._emitter.emit.bind(this._emitter)

    this._sockjs = null
    this.open(opts.remote || window.location.origin + '/ws')
    this._promises = {}

    this._crypto = new Crypto({
      id: 'client',
      state: 'recv-keyex',
      keypair: opts.keypair,
      onReady: () => this.emit.call(this._emitter, 'ready')
    })
  }

  open(url) {
    console.log('backend/connect', url)
    this._sockjs = new SockJS(url, null, {
      sessionId: this.clientId.bind(this)
    })

    this._ref = 0

    this._sockjs.onopen = function() {
      console.log('backend/open', url)
      this._sockjs.onmessage = this.handleHandshake.bind(this)
    }.bind(this)

    this.once('ready', () => this._sockjs.onmessage = this.onData.bind(this))

    this._sockjs.onclose = () => this.emit.apply(this._emitter, ['close'].concat(arguments))
  }

  clientId() {
    return this._clientid = this._clientid || Math.random().toString(36).substr(2, 8)
  }

  // get a unique ref to use for each message
  getRef() {
    return this._clientid + "#" + ++this._ref
  }

  // req-resp style for handshake
  handleHandshake(ev) {
    var res = this._crypto.input(ev.data)

    if (res && 'string' === typeof(res))
      this._sockjs.send(res)
    else if(res)
      console.log('handleHandshake got non-ciphertext payload back from crypto')
  }

  onData(ev) {
    var res = this._crypto.input(ev.data)

    if (res.ev.match(/^!/)) {
      var ref = res.ev.slice(1)
      if (!this._promises[ref])
        return

      if (res.data && res.data.error)
        this._promises[ref].reject(res.data)
      else
        this._promises[ref].resolve(res.data)
    } else {
      console.log('gots an event!', res.ev, res.data)
      this.emit.apply(this._emitter, [res.ev].concat(res.data.arguments || []))
    }
  }

  send(event) {
    var
      ref,
      buf,
      args = Array.prototype.slice.call(arguments, 1)

    buf = this._crypto.output(event, JSON.stringify({
      ref: ref = this.getRef(),
      arguments: args
    }))

    console.log('send/' + event, ref, args)
    this._sockjs.send(buf)
    this._promises[ref] = Q.defer()

    return this._promises[ref].promise
  }
}

window.Backend = SockJSBackend
