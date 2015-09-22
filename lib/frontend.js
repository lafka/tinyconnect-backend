import _ from 'lodash'
import Q from 'q'
import GitHub  from 'github'

import fs from 'fs'
import request from 'request'
import zlib from 'zlib'
import tar from 'tar-fs'
import gzip from 'gunzip-maybe'
import mkdirp from 'mkdirp'
import path from 'path'
import nodeCrypto from 'crypto'
import {EventEmitter} from 'events'

var cachedRequest = require('cached-request')(request)


let gh = new GitHub({
  version: '3.0.0',
  protocol: 'https',
  headers: {'user-agent': 'tiny-connect/0.2.0'},
})

class GHCache {
  constructor(cachedir) {
    this.cachedir = cachedir

    console.log('creating cache dir', this.cachedir)
    mkdirp.sync(this.cachedir)
  }

  get(entity) {
    var
      defered = Q.defer(),
      cachefile = path.join(this.cachedir, entity)

    fs.lstat(cachefile, function(err, res) {
      if (err)
        defered.reject(err)
      else
        fs.readFile(cachefile, function(err, res) {
          if (err)
            defered.reject(err)
          else
            try {
              defered.resolve(JSON.parse(res))
            } catch(e) {
              defered.reject(e)
            }
        })
    })

    return defered.promise
  }

  put(entity, obj) {
    var
      defered = Q.defer(),
      cachefile = path.join(this.cachedir, entity)

    fs.writeFile(cachefile, JSON.stringify(obj, null, 2), function(err) {
      if (err)
        defered.reject(err)
      else
        defered.resolve()
    })

    return defered.promise
  }
}

export class Release {
  constructor(release, opts) {
    this.name = opts.name
    this.release = undefined
    this.remote = false
    this.path = opts.path // may be patched late ron
    this.state = 'unknown' // should be 'unknown', 'error', 'downloading', 'ready'
    this.info_url = opts.info_url
    this.asset_url = opts.asset_url
    this.description = opts.description
    this.prerelease = opts.prerelease

    opts = opts || {}
    this.release = release

    if (!this.path)
      this.remote = true
    else if (!fs.statSync(opts.path).isDirectory())
      throw new Error("frontend `" + parts[0] + "` is not a directory: (" + parts[1] + ")")
    else
      this.state = 'ready' // only if it's a directory
  }

  ensure() {
    var defered = Q.defer()

    if (this.remote && !this.path) {
      var
        hash = nodeCrypto.createHash('sha').update(this.asset_url).digest('hex'),
        dest = path.join(Frontend.cachedir, hash)

      this.path = path.join(Frontend.unpackdir, this.release)

      try {
        if (fs.lstatSync(this.path).isDirectory()) {
          console.log('release: already downloaded - ' + this.path)
          this.state = 'ready'
          defered.resolve(this)
          return defered.promise
        }
      } catch(e) {
        // ENOENT
      }

      console.log('release: starting download - ' + this.release)
      this.state = 'downloading'

      cachedRequest({url: this.asset_url, ttl: 3600000}, function(err, resp) {
          console.log('request to ' + this.asset_url + ' completed')
        }.bind(this))
        .on('end', () => defered.resolve(this))
        .on('error', (err) => defered.reject(err))
        .pipe(gzip())
        .pipe(tar.extract(this.path))
    } else {
      defered.resolve(this)
    }

    return defered.promise
        .then(function(res) {
          this.state = 'ready';
          return res
        }.bind(this) )
  }
}

export class Repository {

  constructor(url, autoupdate, cache) {
    this._repository = (url || "lafka/tinyconnect-gui").split('/')
    this._autoupdate = autoupdate
    this._cache = cache

    if (this._repository.length !== 2)
      throw new Error("Repository expects a string of format `<owner>/<repo>` as it's first argument")
  }

  _scanAndSave(entity, opts, callback) {
    gh.releases.listReleases(
      opts,
      function(err, res) {
        if (!err)
          this._cache.put(entity, res)
            .then(callback(err, res))
        else
          callback(err, res)
      }.bind(this))
  }

  _readCacheOrScan(opts, callback) {
    var
      entity = opts.owner + '/' + opts.repo,
      hash = nodeCrypto.createHash('sha').update(entity).digest('hex')

    this._cache.get(hash)
      .done(
        (res) => callback(undefined, res),
        () => this._scanAndSave(hash, opts, callback)
      )
  }

  scan() {
    var defered = Q.defer()
    this._readCacheOrScan(
      {owner: this._repository[0], repo: this._repository[1]},
      function(err, res) {
        if (err) {
          defered.reject(err)
          return
        }

        var items = _.map(res, function(rel) {
          return new Release(rel.tag_name, {
            name: rel.name,
            info_url: rel.html_url,
            asset_url: rel.assets[0].browser_download_url,
            description: rel.body,
            prerelease: rel.prerelease
          })
        })

        defered.resolve(items)
      }.bind(this)
    )

    return defered.promise
  }
}

export class Frontend extends EventEmitter {
  constructor(args) {
    super()

    var validArgs = [
      'frontend', // --frontend dev:../tinyconnect-gui/dist 0.2.0 || --frontend 0.2.0
      'repository', // --repository github.com/lafka/tinyconnect-frontend
      'auto-update', // --auto-update || --auto-update <min>
      'workdir', // --auto-update || --auto-update <min>
    ]

    if (_.isString(args.frontend))
      args.frontend = [args.frontend]

    Frontend.cachedir = path.join(args.workdir, 'cache')
    Frontend.unpackdir = path.join(args.workdir, 'gui')
    cachedRequest.setCacheDirectory(Frontend.cachedir)
    this._cache = new GHCache(Frontend.cachedir)
    this._repository = new Repository(args.repository, args['auto-update'], this._cache)

    this._releases = _.map(args.frontend || [], function(frontend) {
      var parts = frontend.split(/:/)

      if (parts.length > 2)
        throw new Error("--frontend expects format `<vsn>` or `<name>:<path>`")

      if (1 === parts.length)
        return new Release(parts[0])
      else if (2 === parts.length)
        return new Release(parts[0], {path: parts[1]})
    })

    // scan for repositories
    if (0 === _.filter(this._releases, (rel) => rel.remote).length) {
      this.checkForUpdates()
    } else {
      console.log('no support downloading specific frontend version')
    }

    // initialize auto-update check
  }

  repository() {
    return this._repository
  }

  releases() {
    return this._releases
  }

  checkForUpdates() {
    console.log('checking for updates')
    this._repository.scan()
      .then(function(releases) {
        this._releases = _.union(this._releases, releases)
        console.log('found ' + this._releases.length + ' releases')
        this.emit('releases', this._releases)
      }.bind(this),
      function(err) {
        console.log('failed to scan repo...', err)
      })
  }
}
