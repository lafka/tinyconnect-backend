import _ from 'lodash'
import Q from 'q'

import fs from 'fs'

export class Release {

  constructor(release, opts) {
    this.release = undefined
    this.remote = false
    this.path = undefined
    this.state = 'unknown' // should be 'unknown', 'error', 'downloading', 'ready'

    opts = opts || {}
    this.release = release

    this.path = opts.path

    if (!opts.path)
      this.remote = true
    else if (!fs.statSync(opts.path).isDirectory())
      throw new Error("frontend `" + parts[0] + "` is not a directory: (" + parts[1] + ")")
    else
      this.state = 'ready' // only if it's a directory
  }

  ensure(repository) {
    var defered = Q.defer()

    if (this.remote) {
      this.state = 'error'
      defered.reject()
    } else {
      defered.resolve(this)
    }

    return defered.promise
  }
}

export class Repository {
  _repository: "https://github.com/lafka/tinyconnect-gui"

  constructor(url, autoupdate) {
    if (url)
      this._repository = url

    this._autoupdate = autoupdate
  }

  scan() {
  }

  download(release) {
  }
}

export class Frontend {
  _releases: []
  _repository: undefined

  constructor(args) {
    var validArgs = [
      'frontend', // --frontend dev:../tinyconnect-gui/dist 0.2.0 || --frontend 0.2.0
      'repository', // --repository github.com/lafka/tinyconnect-frontend
      'auto-update', // --auto-update || --auto-update <min>
    ]


    this._repository = new Repository(args.repository, args['auto-update'])

    this._releases = _.map(args.frontend || [], function(frontend) {
      var parts = frontend.split(/:/)

      if (parts.length > 2)
        throw new Error("--frontend expects format `<vsn>` or `<name>:<path>`")

      if (1 === parts.length)
        return new Release(parts[0])
      else if (2 === parts.length)
        return new Release(parts[0], {path: parts[1]})
    })

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
  }

  // esnure a release is actually
  ensure(release) {
  }
}
