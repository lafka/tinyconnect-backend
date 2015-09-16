import http from 'http'
import {Server as StaticServer} from 'node-static'
import sockjs from 'sockjs'
import _ from 'lodash'
import Q from 'q'

import Manager from './manager'
import API from './api'
import Crypto from './crypto'


export default class WebSockets {
  constructor(opts, managerOpts) {
    opts = opts || {}
    managerOpts = managerOpts || {}
    var apiOpts = {}


    managerOpts.onScan = this.onScan.bind(this)
    managerOpts.onClientState = this.onClientState.bind(this)
    managerOpts.onData = this.onClientData.bind(this)

    this._manager = new Manager(managerOpts)

    apiOpts = {manager: this._manager}
    //apiOpts.onData = (buf, channel) => process.send({ev: "data", channel: channel, buf: buf})

    this._api = new API(apiOpts)

    this._peers = []
    this._sockjs = null
    this._static = null
    this._localFiles = new StaticServer('./src')
    this._keypair = Crypto.newKeyPair()

    this.setupServer(opts)
  }

  setupServer(opts) {
    this._sockjs = sockjs.createServer({sockjs_url: "http://cdn.jsdelivr.net/sockjs/1.0.1/sockjs.min.js"});

    this._sockjs.on('connection', this.onConnect.bind(this))

    // serve static files
    this._static = null
    this._localFiles = new StaticServer('./dist')

    this._http = http.createServer()

    if (opts.static)
      this._static = new StaticServer(opts.static)

    this._http.addListener('request', function(req, res) {
      // serve crypto and backend from here
      if (req.url === '/remote.js')
        this._localFiles.serve(req, res)
      else if (this._static)
        this._static.serve(req, res)
    }.bind(this))

    this._http.addListener('upgrade', (req, res) => res.end())

    this._sockjs.installHandlers(this._http, {prefix: '/ws'})

    console.log('listening on 127.0.0.1:6999')
    this._http.listen(6999, '0.0.0.0')
  }

  onScan(clients) {
    clients = _.map(clients, (client) => client.serialize())
    console.log('clients', clients)

    _.each(this._peers, (peer) =>
      peer.write(
        peer._crypto.output('clients', JSON.stringify( {arguments: [clients]} ))
      )
    )
  }

  onClientState(client) {
    _.each(this._peers, function(peer) {
      peer.write(
        peer._crypto.output('client.state', JSON.stringify( {arguments: [client]} ))
      )
    })
  }

  onClientData(client, buf, channel) {
    _.each(this._peers, function(peer) {
      peer.write(
        peer._crypto.output('client.data:' + client._ref,
          JSON.stringify( {arguments: [buf, channel, null]} )
        ))
    })
  }


  onConnect(conn) {
    console.log('client/connect', conn.pathname)

    var handleAuth, handleClose

    conn._crypto = new Crypto({
      id: 'server',
      state: 'init-keyex',
      keypair: this._keypair,
      onReady: function() {
        conn.removeListener('data', handleAuth)
        conn.removeListener('close', handleClose)
        conn.on('data', this.onData.bind(this, conn))
      }.bind(this)
    })

    conn.write(conn._crypto.init())

    conn.once('close', handleClose = () => this.onDisconnect.call(this, conn))
    conn.on('data', handleAuth = function(ev) {
      var res = conn._crypto.input(ev)

      if (res)
        conn.write(res)
    })

    this._peers.push(conn)
  }

  onData(conn, buf) {
    var ev = conn._crypto.input(buf)

    if (undefined === ev.data.ref) {
      console.log('WARN: event did not contain ref', ev)
      return
    }

    var ret = function(res) {
      return conn._crypto.output('!' + ev.data.ref, JSON.stringify(res))
    }

    var evFun = 'ev:' + ev.ev
    if (!this._api[evFun])
      return conn.write(ret({error: "no handler for event " + ev.ev}))


    var
      args = _.isArray(ev.data.arguments || []) ? ev.data.arguments || [] : [ev.data.arguments],
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

