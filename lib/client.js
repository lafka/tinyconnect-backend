import os from 'os'
import nodeCrypto from 'crypto'
import TcpChan from './client/tcpchan'
import SerialChan from './client/serialchan'
import PipedWriter from './client/pipedwrite'
import SyncWriter from './client/syncwrite'

import Q from 'q'
import _ from 'lodash'

var findAllKeys = function(obj, acc, path) {
  path = path || []
  return _.reduce(obj, function(acc, v, k) {
    if ('object' === typeof(v))
      findAllKeys(v, acc, path.concat([k]))

    acc.push(path.concat([k]).join('.'))
    return acc
  }, acc || [])
}

export default class Client {
  constructor(port, opts, settings) {
    var stableId

    // use pnpId for windows and serialNumber for everything else....
    switch (os.platform) {
      case "win32":
        stableId = port.pnpId || (opts||{}).uniqueID || port.comName
        break;;

      default:
        stableId = port.serialNumber || (opts||{}).uniqueID || port.comName
        break;;
    }

    this._ref  =  opts.ref || this.genref(stableId)
    this._name =  opts.name || ""

    this._entity =  _.extend({nid: undefined, sid: undefined, uid: undefined}, opts.entity || {})

    this._persist = undefined === opts.persist ? false : opts.persist
    this._autoconnect = undefined === opts.autoconnect ? false : opts.autoconnect
    this._mode = undefined === opts.autoconnect ? 'pipe' : opts.autoconnect

    this._remote =  _.defaults(settings.tcpchan, {
      host: (opts.remote || {}).host || settings.tcpchan.host,
      port: (opts.remote || {}).port || settings.tcpchan.port
    })

    this._port =  _.defaults(settings.serialchan, {
      baudrate: (opts.port || {}).baudrate || settings.serialchan.baudrate,
      path: port.comName || (opts.port || {}).path,
      uniqueID: stableId,
      port: port || (opts.port || {}).port
    })

    this._settings = settings

    this._onData = opts.onData.bind(this, this)
    this._onChange = opts.onChange
    this._chans = {
        tcp: new TcpChan(this._remote, this._onData, this._onChange.bind(this, this)),
        serial: new SerialChan(this._port, this._onData, this._onChange.bind(this, this))
    }

    if (this._onChange)
      this._onChange(this)

    // DO AUTOCONNECT
  }

  usesPort(port) {
    var stableId
    switch (os.platform) {
      case "win32":
        stableId = port.pnpId || port.comName
        break;;

      default:
        stableId = port.serialNumber || port.comName
        break;;
    }

    return this._port.port && (
               stableId === this._port.port.serialNumber
            || stableId === this._port.port.pnpId
            || stableId === this._port.port.comName)

  }

  identifier() {
    return this._port.uniqueID
  }

  genref(stableid, length) {
    length = length || 8
    return nodeCrypto.createHash('sha')
      .update(stableid || Math.random().toString())
      .digest('hex').substr(0, length)
  }

  setAvailable(port) {
    this._port.path = port.comName
    this._port.port = port
    this._chans.serial = new SerialChan(this._port, this._onData)

    if (this._onChange)
      this._onChange(this)
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

        this._mode = mode
        return undefined

      case 'sync':
        var ret = this._chans.serial.setWriter(SyncWriter)
        console.log('debug: enabling `sync` mode on tty')

        if (ret) {
          if (this._chans.tcp)
            this._chans.tcp.disconnect()

          this._mode = mode
        } else {
          return {error: "failed to enable writer, no active serialport", writer: "SyncWriter"}
        }

        return undefined

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

      available:       this.available(),
      persist:         this._persist,
      autoconnect:     this._autoconnect,
      mode:            this._mode,

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
      ref:             state.ref || this.genref(port.serialNumber || state.port.uniqueID),
      name:            state.name || "",

      entity:          {
        nid: state.entity.nid,
        sid: state.entity.sid,
        uid: state.entity.uid
      },

      persist:         state.persist || false,
      autoconnect:     state.autoconnect || false,
      mode:            state.mode,

      remote: {
        host: state.settings.tcpchan.host || settings.tcpchan.host,
        port: state.settings.tcpchan.port || settings.tcpchan.port
      },

      port: {
        baudrate: state.settings.serialchan.baudrate || settings.serialchan.baudrate,
        path:     state.settings.serialchan.path || settings.serialchan.path,
        uniqueID: state.port.uniqueID,
      }
    })
  }

  patch(patch) {
    var map = {
      name: '_name',
      persist: '_persist',
      autoconnect: '_autoconnect',
      mode: '_mode',

      remote: {
        host: '_remote.host',
        port: '_remote.port'
      },

      port: {
        baudrate: '_port.baudrate'
      }
    }

    var
      mappingKeys = findAllKeys(map),
      patchKeys = findAllKeys(patch),
      invalid = _.without.apply(_, [patchKeys].concat(mappingKeys))

    if (invalid.length > 0)
      return {error: "cannot update client parameter: '" + invalid.join("', '") + "'", client: this._ref, params: invalid}

    var client = this
    var doPatch = () =>
      _.each(patchKeys, function(v) {
        var path = _.get(map, v)
        if (_.isString(path)) {
          _.set(client, path, _.get(patch, v))
        }
      })

    // make sure mode gets set properly
    if (patch.mode) {
      var res = (client.setMode(patch.mode) || {}).error
      if (res.error === 'invalid mode')
        return res
    }

    doPatch()

    if (!patch.mode) {
      // reconnect channels if necassery
      if (this._chans.serial.connected() && _.any(patchKeys, function(m) { return m.match(/^port./); }))
        client.disconnect(['serial'])
          .done(() => client.connect(['tcp']))

      if (this._chans.tcp.connected() && _.any(patchKeys, function(m) { return m.match(/^remote./); }))
        client.disconnect(['tcp'])
          .done(() => client.connect(['tcp']))
    }

    if (this._onChange)
      this._onChange(this)

    return this.serialize()
  }
}

