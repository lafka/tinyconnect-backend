import http from 'http'
import path from 'path'
import fs from 'fs'
import mkdirp from 'mkdirp'
import nodeCrypto from 'crypto'

import open from 'open'
import send from 'send'

import sockjs from 'sockjs'
import _ from 'lodash'
import Q from 'q'
Q.longStackSupport = true;


import Manager from './manager'
import API from './api'
import Crypto from './crypto'


export default class WebSockets {
  static argsMapper(args) {
    var validArgs = [
      'workdir',
      'port',
      'bind',
      'open', // don't open in default browser
    ]

    return _.pick(args, validArgs)
  }

  constructor(opts, managerOpts, frontend) {
    this._manager = undefined
    this._api = undefined

    this._connections = []
    this._frontendReleases = []

    this._peers = []
    this._sockjs = undefined
    this._static = undefined

    this._keypair = undefined

    opts = _.merge({}, {
      bind: '127.0.0.1',
      port: '6999',
      open: true,
    }, opts || {})

    this.maybeOpenAndExit(opts)
      .done(function(res) {
        console.log('creating new server', res)

        mkdirp.sync(opts.workdir)

        managerOpts = managerOpts || {}
        var apiOpts = {}


        managerOpts.onScan = this.onScan.bind(this)
        managerOpts.onClientState = this.onClientState.bind(this)
        managerOpts.onData = this.onClientData.bind(this)

        this._manager = new Manager(managerOpts)

        apiOpts = {manager: this._manager}
        //apiOpts.onData = (buf, channel) => process.send({ev: "data", channel: channel, buf: buf})

        this._api = new API(apiOpts)

        this._keypair = Crypto.newKeyPair()

        this.setupServer(opts, frontend)
      }.bind(this), function(res) {
        console.log('there seems to be a instance running already')

        if (opts.open)
          open('http://' + opts.bind + ':' + opts.port)
      })

  }

  // check if a server is already running for the given config and if so open
  // it in a browser UNLESS --no-open is given
  maybeOpenAndExit(opts) {
    var
      addr = opts.bind + ":" + opts.port,
      hash,
      p,
      defered = Q.defer()

    hash = nodeCrypto.createHash('sha').update(addr).digest('hex')
    p = path.join(opts.workdir, 'state-' + hash)

    try {
      // hash is the configuration, if it's exists it mean that something has
      // been running on this network/port
      fs.readFileSync(p)
    } catch(e) {
      // no file, we can open!
      defered.resolve()
      return defered.promise
    }

    var req = http.get({
      hostname: opts.bind,
      port: opts.port,
      path: '/ping',
    }, function(res) {
      defered.reject()
    })

    req.on('socket', function(socket) {
      socket.setTimeout(500)
      socket.on('timeout', () => req.abort() && defered.resolve())
    })
    req.on('error', () => defered.resolve())
    req.end()
    return defered.promise
  }

  writeState(opts) {
    var
      addr = opts.bind + ":" + opts.port,
      hash,
      p

    hash = nodeCrypto.createHash('sha').update(addr).digest('hex')
    p = path.join(opts.workdir, 'state-' + hash)

    fs.writeFileSync(p, process.pid + "#" + addr)
  }

  setupServer(opts, frontend) {
    var writeEv = function(peer, ev, data) {
      peer.write('event: ' + ev + '\n')
      peer.write('data: ' + data + '\n\n')
    }

    var initSSE = function(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      })

      res.write('\n')

      this._connections.push(res)

      req.on('close', function() {
        this._connections = _.without(this._connections, res)
      }.bind(this))
    }.bind(this)

    // setup frontends
    var staticHandlers = {}
    frontend.on('releases', function(releases) {
      _.each(releases, function(release) {
        release.ensure()
          .done(
            function(release) {
              this._frontendReleases.push(release)
              staticHandlers[release.release] = release.path

              _.each(this._connections, (peer) => writeEv(peer, 'state', JSON.stringify(frontend.releases())))
            }.bind(this),
            function(err) {
              console.log('failed to bind frontend: ', release.release, err)

              if (_.isError(err))
                console.log(err.stack)

              _.each(this._connections, function(peer) {
                writeEv(peer, 'load-error', JSON.stringify({error: err, release: release.release}))
                writeEv(peer, 'state', JSON.stringify(frontend.releases()))
              })
            }.bind(this)
          )
      }.bind(this))
    }.bind(this))

    this._http = http.createServer(function(req, res) {
      function err(handler, newpath, err) {
        res.statusCode = err.status || 500

        switch (res.status) {
          case 404:
            res.end(fs.readFileSync('./dist/' + res.status + '.html'))
            break

          default:
            res.end(err.message)
        }
      }

      function redirect() {
        console.log('redirect', req.url)
        res.statusCode = 301
        res.setHeader('Location', req.url + '/')
        res.end('')
      }

      if ('/events' === req.url) {
        initSSE(req, res)
        writeEv(res, 'state', JSON.stringify(frontend.releases()))
      } else if (req.url.match(/^\/app\/.*/)) {
        var handler = req.url.split(/(\/)/)[4]


        handler = staticHandlers[handler]
        if (handler) {
          var newpath = req.url.replace(/^\/app\/[^/]*/, '')
          if (!newpath)
            redirect()
          else
            send(req, newpath, {root: handler})
              .on('error', err.bind(this, handler, newpath))
              .on('directory', redirect)
              .pipe(res)
        } else {
          send(req, '/missing-frontend.html', {root: './dist'})
            .on('error', err.bind(this, handler, newpath))
            .on('directory', redirect)
            .pipe(res)
        }
      } else  {
        send(req, req.url, {root: './dist'} )
          .on('error', err.bind(this, handler, newpath))
          .on('directory', redirect)
          .pipe(res)
      }

    }.bind(this))

    this._sockjs = sockjs.createServer({sockjs_url: "http://cdn.jsdelivr.net/sockjs/1.0.1/sockjs.min.js"});
    this._sockjs.on('connection', this.onConnect.bind(this))

    this._http.addListener('upgrade', (req, res) => res.end())

    this._sockjs.installHandlers(this._http, {prefix: '/ws'})

    console.log('listening on ' + opts.bind + ':' + opts.port)
    this._http.listen(parseInt(opts.port), opts.bind)

    this.writeState(opts)

    if (false !== opts.open)
      open('http://' + opts.bind + ':' + opts.port)
  }

  onScan(clients) {
    clients = _.map(clients, (client) => client.serialize())
    _.each(this._peers, (peer) =>
      peer.write(
        peer._crypto.output('clients', JSON.stringify( {arguments: [clients]} ))
      )
    )
  }

  onClientState(objhash, client) {
    _.each(this._peers, function(peer) {
      peer._clientHashes = peer._clientHashes || {}

      // don't re-push old changes
      if (objhash === peer._clientHashes[client])
        return

      peer.write(
        peer._crypto.output('client.state', JSON.stringify( {arguments: [client]} ))
      )

      peer._clientHashes[client] = objhash
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

