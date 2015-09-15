import http from 'http'
import sockjs from 'sockjs'
import _ from 'lodash'
import Q from 'q'

import Manager from './manager'
import API from './api'


export default class WebSockets {
  constructor(managerOpts) {
    managerOpts = managerOpts || {}

    //opts.onScan = (clients) => process.send({ev: "clients", clients: clients})

    managerOpts.onScan = this.onScan.bind(this)
    managerOpts.onClientState = this.onClientState.bind(this)
    managerOpts.onData = this.onClientData.bind(this)
    this._manager = new Manager(managerOpts)

    var apiOpts = {}
    apiOpts = {manager: this._manager}
    //apiOpts.onData = (buf, channel) => process.send({ev: "data", channel: channel, buf: buf})

    this._api = new API(apiOpts)


    this._peers = []
    this._sockjs = sockjs.createServer({sockjs_url: "http://cdn.jsdelivr.net/sockjs/1.0.1/sockjs.min.js"});

    this._sockjs.on('connection', this.onConnect.bind(this))

    this._http = http.createServer()
    this._http.addListener('upgrade', (req, res) => res.end())

    this._sockjs.installHandlers(this._http, {prefix: '/ws'})

    console.log('listening on 127.0.0.1:6999')
    this._http.listen(6999, '0.0.0.0')
  }

  onScan(clients) {
    clients = _.map(clients, (client) => client.serialize())

    _.each(this._peers, (peer) =>
      peer.write(JSON.stringify({ev: "clients", arguments: [clients]}))
     )
  }

  onClientState(client) {
    _.each(this._peers, (peer) =>
      peer.write(JSON.stringify({ev: "client.state", arguments: [client]}))
     )
  }

  onClientData(client, buf, channel) {
    console.log('write to client', client._ref, buf, channel)
    _.each(this._peers, (peer) =>
      peer.write(JSON.stringify({
        ev: "client.data:" + client._ref,
        arguments: [buf, channel, null]
      }))
     )
  }

  onConnect(conn) {
    console.log('client/connect', conn.pathname)

    conn.on('close', () => this.onDisconnect.call(this, conn))
    conn.on('data',  (buf) => this.onData.call(this, conn, buf))

    this._peers.push(conn)
  }

  onData(conn, buf) {
    console.log('client/data', conn.pathname, buf)

    var ev
    try {
      ev = JSON.parse(buf)
    } catch(e) {
      return e
    }

    if (undefined === ev.ref) {
      console.log('WARN: event did not contain ref', ev)
      return
    }

    if (undefined === ev.ev) {
      console.log('WARN: event did not contain a `ev` parameter', ev)
      return
    }

    var ret = function(res) {
      res = res || {}
      res.ref = ev.ref
      res.ev = 'r:' + ev.ev

      return JSON.stringify(res)
    }

    var evFun = 'ev:' + ev.ev
    if (!this._api[evFun])
      return conn.write(ret({error: "no handler for event " + ev.ev}))


    var
      args = _.isArray(ev.arguments || []) ? ev.arguments || [] : [ev.arguments],
      res = this._api[evFun].apply(this._api, args)


    if (Q.isPromise(res)) {
      res.done((res) => conn.write(ret(res)),
        function(res) {
          if (res.error)
            conn.write(ret(res))
          else if (_.isError(res))
            conn.write(ret({error: res.toString()}))
        })
    } else {
      conn.write(ret(res))
    }
  }

  onDisconnect(conn) {
    console.log('client/close', conn.pathname)
    this._peers = _.without(this._peers, conn)
  }
}

