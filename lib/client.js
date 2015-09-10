import TcpChan from './client/tcpchan'
import SerialChan from './client/serialchan'
import PipedWriter from './client/pipedwrite'
import SyncWriter from './client/syncwrite'

import Q from 'q'
import _ from 'lodash'

export default class Client {
  constructor(port, opts, settings) {
    this._ref  =  opts.ref || this.genref()
    this._name =  opts.name || ""

    this._entity =  _.extend({nid: undefined, sid: undefined, uid: undefined}, opts.entity || {})

    this._available = undefined === opts.available ? true : opts.available
    this._persist = undefined === opts.persist ? false : opts.persist
    this._autoconnect = undefined === opts.autoconnect ? false : opts.autoconnect

    this._remote =  _.defaults(settings.tcpchan, {
      host: (opts.remote || {}).host || settings.tcpchan.host,
      port: (opts.remote || {}).port || settings.tcpchan.port
    })

    this._port =  _.defaults(settings.serialchan, {
      baudrate: (opts.port || {}).baudrate || settings.serialchan.baudrate,
      path: port.comName || (opts.port || {}).path,
      uniqueID: port.serialNumber || (opts.port || {}).uniqueID,
      port: port || (opts.port || {}).port
    })

    this._settings = settings

    this._onData = opts.onData
    this._chans = {
        tcp: new TcpChan(this._remote, this._onData),
        serial: new SerialChan(this._port, this._onData)
    }

    // DO AUTOCONNECT
  }

  identifier() {
    return this._port.uniqueID
  }

  genref(length) {
    length = length || 8
    return Math.random().toString(36).substr(2, length)
  }

  setAvailable(port) {
    this._port.path = port.comName
    this._port.port = port
    this._chans.serial = new SerialChan(this._port, this._onData)
  }

  setUnavailable() {
    this._port.port = undefined
  }

  available() {
    return undefined !== this._port.port
  }


  connect(chans) {
    chans = chans || ['tcp', 'serial']
    var invalidChans = _.without(chans, 'tcp', 'serial')
    if (invalidChans.length > 0)
      return {error: "can't connect invalid chans", chans: invalidChans}

    var promises = []
    _.each(chans, function(chan) {
      promises.push(this._chans[chan].connect())
    }.bind(this))

    return promises.length > 0 ? Q.all(promises) : undefined
  }

  disconnect(chans) {
    chans = chans || ['tcp', 'serial']
    var invalidChans = _.without(chans, 'tcp', 'serial')
    if (invalidChans.length > 0)
      return {error: "can't disconnect invalid chans", chans: invalidChans}

    var promises = []
    _.each(chans, function(chan) {
      promises.push(this._chans[chan].disconnect())
    }.bind(this))

    return promises.length > 0 ? Q.all(promises) : undefined
  }

  setMode(mode) {
    switch (mode) {
      case 'pipe':
        if (!this._chans.tcp.connected())
          return {error: "failed to enable writer, requires a active TCP Channel", writer: "PipedWriter"}

        let writer = this._chans.serial.setWriter(PipedWriter)
        if (!writer)
          return {error: "failed to enable writer, no active serialport", writer: "PipedWriter"}

        console.log('debug: enabling `pipe` mode on tty')

        // link this shit!
        writer.link(this._chans.tcp,
          {
            'data': writer.write.bind(writer),
            'end':  function() { writer.unlink.call(writer, this._chans.tcp) }.bind(this),
            'error':  function() { writer.unlink.call(writer, this._chans.tcp) }.bind(this)
          },
          {
            'data': this._chans.tcp.write.bind(this._chans.tcp),
            'close': this._chans.tcp.disconnect.bind(this._chans.tcp),
            'end': this._chans.tcp.disconnect.bind(this._chans.tcp),
            'error': this._chans.tcp.disconnect.bind(this._chans.tcp)
          })

        var closeHandler
        this._chans.tcp.addListener('close', closeHandler = function() {
          writer.unlink(this.chans_tcp)
          this._chans.tcp.removeListener('close', closeHandler)
        }.bind(this))


        return undefined

      case 'sync':
        var ret = this._chans.serial.setWriter(SyncWriter)
        console.log('debug: enabling `sync` mode on tty')
        return ret ? undefined : {error: "failed to enable writer, no active serialport", writer: "SyncWriter"}

      default:
        return {error: "invalid mode", mode: mode}
    }
  }


  serialize() {
    return {
      ref:             this._ref,
      name:            this._name,

      entity:          {
        nid: this._entity.nid,
        sid: this._entity.sid,
        uid: this._entity.uid
      },

      available:       this._available,
      persist:         this._persist,
      autoconnect:     this._autoconnect,

      remote: {
        host: this._settings.tcpchan.host,
        port: this._settings.tcpchan.port,
        connected: this._chans.tcp.connected()
      },

      port: {
        baudrate:  this._port.baudrate,
        path:      this._port.path,
        uniqueID:  this._port.uniqueID,
        connected: this._chans.serial.connected()
      }
    }
  }

  unserialize(port, state, settings) {
    return new Client(port, {
      ref:             state.ref || this.genref(),
      name:            state.name || "",

      entity:          {
        nid: state.entity.nid,
        sid: state.entity.sid,
        uid: state.entity.uid
      },

      available:       state.available,
      persist:         state.persist || false,
      autoconnect:     state.autoconnect || false,

      remote: {
        host: state.settings.tcpchan.host || settings.tcpchan.hott,
        port: state.settings.tcpchan.port || settings.tcpchan.port
      },

      port: {
        baudrate: state.settings.serialchan.baudrate || settings.serialchan.baudrate,
        path:     state.settings.serialchan.path || settings.serialchan.path,
        uniqueID: state.port.uniqueID,
      }
    })
  }
}

