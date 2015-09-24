import fs from 'fs'
import path from 'path'
import nodeCrypto from 'crypto'

import tar from 'tar-fs'
import gzip from 'gunzip-maybe'

import request from 'request'
import _ from 'lodash'
import Q from 'q'
Q.longStackSupport = true;

var cachedRequest = require('cached-request')(request)

export class Release {
  constructor(release, data, opts) {
    opts = opts || {}
    data = data || {}

    if (!release)
      throw new Error("release: a identifier is required")

    this.release = release
    this.name = data.name
    this.remote = false
    this.path = data.path // may be patched late ron
    this.state = 'unknown' // should be 'unknown', 'error', 'downloading', 'ready'
    this.info_url = data.info_url
    this.assets = data.assets
    this.description = data.description
    this.prerelease = data.prerelease
    this.body = data.body

    this._cachedir = opts.cachedir
    this._distdir = opts.distdir

    if (!this._cachedir)
      throw new Error("release: requires a .cachedir option")

    cachedRequest.setCacheDirectory(this._cachedir)

    if (!this.path)
      this.remote = true
    else if (!fs.statSync(opts.path).isDirectory())
      throw new Error("release: `" + parts[0] + "` is not a directory: (" + parts[1] + ")")
    else
      this.state = 'ready' // only if it's a directory
  }

  ensure() {
    var defered, promises = []

    if (!this._distdir) {
      defered = Q.defer()
      defered.reject(new Error("release: no dist dir set for release"))
      return defered.promise
    }

    if (this.remote && !this.path) {
      console.log('release: starting download - ' + this.release)
      this.state = 'downloading'

      // for now this just ensures the GUI part, need to create a strategy for
      // "resolving" different types of files, i.e. installer excutables/.app etc
      promises = _.map(this.assets, function(asset) {
        var
          assetPromise = Q.defer(),
          hash = nodeCrypto.createHash('sha').update(asset.url).digest('hex'),
          dest = path.join(this._cachedir, hash)

        this.path = path.join(this._distdir, this.release)

        try {
          if (fs.lstatSync(this.path).isDirectory()) {
            defered = Q.defer()
            console.log('release: already downloaded - ' + this.path)
            this.state = 'ready'
            defered.resolve(this)
            return defered.promise
          }
        } catch(e) {
          // ENOENT
        }

        cachedRequest({url: asset.url, ttl: 3600000}, function(err, resp) {
            console.log('release: request to ' + asset.url + ' completed')
            this.state = 'ready'
          }.bind(this))
          .pipe(gzip())
          .pipe(tar.extract(this.path))
          .on('finish', () => assetPromise.resolve(this))
          .on('error', (err) => assetPromise.reject(err))

        assetPromise.promise.then(
          function(res) { this.state = 'ready'; return res; },
          (err) => this.state = 'error'
        )

        return assetPromise.promise
      }.bind(this))
    }

    if (promises.length > 0) {
      return Q.all(promises)
        .then(() => this)
    } else {
      defered = Q.defer()
      defered.resolve()
      return defered.promise
    }
  }
}
