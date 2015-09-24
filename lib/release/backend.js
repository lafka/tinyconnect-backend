import _ from 'lodash'
import path from 'path'
import {EventEmitter} from 'events'

import {Release} from './release.js'
import {Repository} from './repository.js'

export class Backend extends EventEmitter {
  constructor(args) {
    super()

    var validArgs = [
      '--backend-repository', // --repository github.com/lafka/tinyconnect-frontend
      'workdir', // --auto-update || --auto-update <min>
    ]

    if (_.isString(args.frontend))
      args.frontend = [args.frontend]

    this._cachedir = path.join(args.workdir, 'cache')

    var repo = args.repository || 'lafka/tinyconnect-backend'
    this._repository = new Repository(repo, args['auto-update'], this._cachedir)

    this.checkForUpdates()

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
        console.log('release/backend: found ' + releases.length + ' releases')
        this._releases = releases
        this.emit('releases', this._releases)
      }.bind(this),
      function(err) {
        console.log('release/backend: failed to scan repo...', err)
      })
  }
}

