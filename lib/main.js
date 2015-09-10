import API from './api'
import Q from 'q'
import _ from 'lodash'


class Main {
  constructor(opts) {
    opts = opts || {}
    opts.onData = function(buf, channel) {
      process.send({ev: "data", channel: channel, buf: buf})
    }
    this._api = new API(opts)

    process.on('message', this.handleData.bind(this))
    process.send({ev: 'ready'})
  }

  returnErr(err, meta) {
    process.send(_.extend({error: "Error: " + err}, meta || {}))
  }

  returnOK(res, ref) {
    if (res)
      process.send(_.extend({ref: ref}, res))
  }

  handleData(data) {
    if (!data.ref)
      return this.returnErr("message did not contain `ref`")

    if (!data.ev)
      return this.returnErr("message did not contain `ev`", {ref: data.ref})


    var ev = 'ev:' + data.ev
    if (!this._api[ev])
      return this.returnErr("no handler for event", {ev: data.ev, ref: data.ref})


    var
      args = _.isArray(data.arguments || []) ? data.arguments || [] : [data.arguments],
      res = this._api[ev].apply(this._api, args)

    if (Q.isPromise(res)) {
      res.done(
        function(res) {
          this.returnOK(res ? _.cloneDeep(res) : res, data.ref)
        }.bind(this), function(err) {
          if (err.stack)
            console.log(err.stack)

          this.returnErr(err, {ref: data.ref})
        }.bind(this))
    } else {

      if (res && res.error)
        this.returnErr(res.error, _.extend(_.cloneDeep(res), {ref: data.ref}))
      else
        this.returnOK(data.ref, res ? _.cloneDeep(res) : res)
    }
  }
}


new Main()
