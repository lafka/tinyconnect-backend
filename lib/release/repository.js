import fs from 'fs'
import path from 'path'
import nodeCrypto from 'crypto'
import mkdirp from 'mkdirp'

import _ from 'lodash'
import Q from 'q'
Q.longStackSupport = true;

import request from 'request'
import GitHub  from 'github'

var cachedRequest = require('cached-request')(request)

import {Release} from './release.js'

let gh = new GitHub({
  version: '3.0.0',
  protocol: 'https',
  headers: {'user-agent': 'tiny-connect/0.2.0'},
})

class GHCache {
  constructor(cachedir) {
    this.cachedir = cachedir

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

export class Repository {
  constructor(url, autoupdate, cachedir, distdir) {
    if (!url)
      throw new Error("release/repository: no url specified")

    if (!cachedir)
      throw new Error("release/repository: no cachedir specified")

    this._repository = (url || "lafka/tinyconnect-gui").split('/')
    this._autoupdate = autoupdate
    this._cachedir = cachedir
    this._distdir = distdir
    this._cache = new GHCache(cachedir)

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
          var assets = _.map(rel.assets, function(asset) {
            return {
              url: asset.browser_download_url,
              content_type: asset.content_type,
              name: asset.name,
            }
          })

          return new Release(rel.tag_name,
            {
              name: rel.name,
              info_url: rel.html_url,
              assets: assets,
              description: rel.body,
              prerelease: rel.prerelease,
              body: rel.body
            },
            {
              cachedir: this._cachedir,
              distdir:  this._distdir
            })
        }.bind(this))

        defered.resolve(items)
      }.bind(this)
    )

    return defered.promise
  }
}
