import Manager from './manager'
import Q from 'q'
import _ from 'lodash'

export default class API {
  constructor(opts) {
    this._manager = opts.manager || new Manager(opts)
    this._onData = opts.onData

  }

  getClientByRef(ref, serialize) {
    if (_.isString(ref))
      return this._manager.getClients({_ref: ref}, serialize)[0]
    else
      return this._manager.getClients(ref, serialize)[0]
  }

  'ev:settings'(query) {
    return this._manager.getSettings()
  }

  'ev:clients'(query) {
    return this._manager.getClients(query)
  }

  'ev:clients.scan'() {
    this._manager.scan().then(this._manager.onScan.bind(this._manager))
    return
  }

  'ev:client.mode'(ref, mode) {
    var client = this.getClientByRef(ref, false)

    if (!client)
      return {error: "no such client", client: ref}

    return client.setMode(mode)
  }

  'ev:client.connect'(ref, channels, mode) {
    if (!mode)
      return {error: "mode must be set when connecting"}

    var client = this.getClientByRef(ref, false)

    if (!client)
      return {error: "no such client", client: ref}

    var promise = client.connect(channels)

    if (!Q.isPromise(promise)) {
      return promise
    }

    if (mode) {
      return promise.then(() => client.setMode(mode))
    } else {
      return promise
    }
  }

  'ev:client.disconnect'(ref, channels) {
    var client = this.getClientByRef(ref, false)

    if (!client)
      return {error: "no such client", client: ref}

    return client.disconnect(channels)
  }

  'ev:client.update'(ref, patch) {
    var client = this.getClientByRef(ref, false)

    if (!client)
      return {error: "no such client", client: ref}

    return client.patch(patch)
  }

  'ev:client.write'(ref, buf) {
    var client = this.getClientByRef(ref, false)

    if (!client)
      return {error: "no such client", client: ref}

    return client._chans.serial.write(buf)
  }

  'ev:client.command'(ref, command) {
    // @todo Add callback API to client/tinymesh
    var client = this.getClientByRef(ref, false)

    if (!client)
      return {error: "no such client", client: ref}
  }
}
