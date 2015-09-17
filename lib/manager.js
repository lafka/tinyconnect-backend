import Q from 'q'
import _ from 'lodash'
import serial from 'serialport'

import Client from './client'

export default class Manager {

  constructor(opts) {
    this._opts = _.defaults(opts || {}, {
      scanInterval: 1000,
    })

    this._settings = {
      tcpchan: {
        host: 'localhost',
        port: 7001
      },
      serialchan: {
        baudrate: 19200,
        path: undefined
      }
    }

    this._onScan = opts.onScan

    this._clients = {}
    this._clientRefs = {}
    this.scan().then(this.onScan.bind(this))

    if (this._opts.scanInterval)
      this._interval = setInterval(function() {
        this.scan().then(this.onScan.bind(this))
      }.bind(this), this._opts.scanInterval)
  }

  getSettings(group) {
    return _.cloneDeep(group ? this._settings[group] : this._settings)
  }

  setSettings(path, value) {
    _.set(path, value)
  }

  getClients(query, serialize) {
    return _.chain(this._clients)
          .map((client) => false === serialize ? client : client.serialize())
          .where(query)
          .value()
  }

  onScan(clients) {
    this._clients = clients
    this._onScan && this._onScan(clients)
  }

  hashCode(val) {
    var hash = 0

    if (val.length == 0)
      return hash;

    for (var i = 0; i < val.length; i++) {
        let chr = val.charCodeAt(i)
        hash = ((hash << 5) - hash) + chr
        hash = hash & hash
    }
    return hash
  }

  // return a promise which resolves on client scan where new changes where
  // found, rejects if no change
  scan() {
    let defered = Q.defer()

    const updateClient = function(client) {
      if (!this._opts.onClientState)
        return

      var ref = this.hashCode(JSON.stringify(client.serialize()))

      this._opts.onClientState(ref, client.serialize())
      this._clientRefs[client.ref] = ref
    }.bind(this)


    serial.list(function(err, ports) {
      if (err) {
        defered.reject(err)
      } else {
        let haveChanges = false

        let ret = _.reduce(ports, function(acc, port) {
          let client = this._clients[port.comName]

          if (client && port.serialNumber === client.identifier()) {
            // previously known serial port was re-inserted
            if (!client.available()) {
              client.setAvailable(port)
              console.log('debug: re-initialized port ' + client._ref + ' @' + port.comName)
              haveChanges = true
            }

            acc[port.comName] = client
          } else {
            // a new serial port inserted
            acc[port.comName] = new Client(port,
                                           {onData: this._opts.onData, onChange: updateClient},
                                           this.getSettings())
            console.log('debug: added port ' + acc[port.comName]._ref + ' @' + port.comName)
            haveChanges = true
          }

          return acc
        }.bind(this), {})

        _.each(this._clients, function(client, k) {
          if (!ret[k] && client.available()) {
            console.log('debug: removed port ' +  client._ref + ' from ' + client._port.path)
            client.setUnavailable()
            ret[client._port.path] = client
            haveChanges = true
          }
        })


        if (haveChanges) {
          this._onScan && this._onScan(ret)
          defered.resolve(ret)
        } else {
          defered.reject(null)
        }
      }
    }.bind(this))

    return defered.promise
  }
}
