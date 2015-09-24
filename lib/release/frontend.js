import _ from 'lodash'
import path from 'path'
import {EventEmitter} from 'events'

import {Release} from './release.js'
import {Repository} from './repository.js'

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

    this._cachedir = path.join(args.workdir, 'cache')
    this._distdir = path.join(args.workdir, 'gui')

    var repo = args.repository || 'lafka/tinyconnect-gui'
    this._repository = new Repository(repo, args['auto-update'], this._cachedir, this._distdir)

    this._releases = _.map(args.frontend || [], function(frontend) {
      var parts = frontend.split(/:/)

      if (parts.length > 2)
        throw new Error("--frontend expects format `<vsn>` or `<name>:<path>`")

      if (1 === parts.length)
        return new Release(parts[0], null, {cachedir: this._cachedir, distdir: this._distdir})
      else if (2 === parts.length)
        return new Release(parts[0], null, {path: parts[1], cachedir: this._cachedir, distdir: this._distdir})
    })

    // scan for repositories
    if (0 === _.filter(this._releases, (rel) => rel.remote).length) {
      this.checkForUpdates()
    } else {
      console.log('release/frontend: no support downloading specific version')
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
    this._repository.scan()
      .then(function(releases) {
        this._releases = _.union(this._releases, releases)
        console.log('release/frontend: found ' + this._releases.length + ' releases')
        this.emit('releases', this._releases)
      }.bind(this),
      function(err) {
        console.log('release/frontend: failed to scan repo...', err)
      })
  }
}
