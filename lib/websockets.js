import http from 'http'
import sockjs from 'sockjs'
import _ from 'lodash'

import Manager from './manager'
import API from './api'


export default class WebSockets {
  constructor(opts) {
    opts = opts || {}

    //opts.onScan = (clients) => process.send({ev: "clients", clients: clients})

    opts.onScan = (clients) => this.onScan.bind(this)
    this._manager = new Manager(opts)

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
    console.log('manager scanned!')

    _.each(this._peers, (peer) => peer.send(JSON.stringify({ev: "clients", clients: clients})))
  }

  onConnect(conn) {
    console.log('client/connect', conn.pathname)

    conn.on('close', () => this.onDisconnect.call(this, conn))
    conn.on('data',  () => this.onData(call(this, conn, buf)))

    conn.write(JSON.stringify({ev: "clients", arguments: [this._manager.getClients()]}))
    this._peers.push(conn)
  }

  onData(conn, buf) {
    console.log('client/data', conn.pathname, buf)
  }

  onDisconnect(conn) {
    console.log('client/close', conn.pathname)
    this._peers = _.without(this._peers, conn)
  }
}

