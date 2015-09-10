/**
 * wrapper for node-serialport/serialport-electron
 */

import API  from '../api'
import {SerialPort} from 'serialport'

import Q from 'q'
import _ from 'lodash'

// guess work on when we should dump the buffer
var parser = function(opts) {
	var
		data = new Buffer(0),
		timer

	return function(emitter, buffer) {
		data = Buffer.concat([data, buffer])

		if (undefined === timer)
			timer = setTimeout(function() {
				if (data.length > 0) {
					emitter.emit('data', data)
					timer = undefined
					data = new Buffer(0)
				}
			}, ((opts.baudrate) / 1000))
	}
}

export default class SerialChannel {
  constructor(opts, onData) {
    this._opts = _.defaults(opts || {}, {
      path: '/dev/ttyUSB0',
      baudrate: 19200
    })

    if (!this._opts.parser)
      this._opts.parser = parser(this._opts)

    this._tty = undefined
    this._opening = false
    this._onData = onData

    this._writer = undefined
  }

  setWriter(writer) {
    if (undefined === this._tty)
      return false

    if (this._writer) {
      console.log('debug: serialchan/writer releasing previous writer')
      this._writer.release()
    }

    this._writer = new writer(this._tty)
    return this._writer
  }

  getWriter() {
    return this._writer
  }

  onData(buf) {
    if (this._onData)
      this._onData(buf, 'downstream')
    else
      console.log("ERROR no handler for SerialChan.onData, specify onData when creating object")
  }

  connected() {
    return this._tty && this._tty.isOpen()
  }

  connect() {
    if (false !== this._opening)
      return this._opening

    var defered = Q.defer()

    if (this.connected()) {
      defered.resolve()
      return defered.promise
    }

    this._opening = defered.promise
    this._tty = new SerialPort(this._opts.path, {
      baudrate: this._opts.baudrate,
      parser:   this._opts.parser
    }, false)

    this._tty.open(function(err) {
      this._opening = false
      if (err) {
        console.log('debug: serialchan/err', err)
        defered.reject(err)
      } else {
        console.log('debug: serialchan/open')

        this._tty.on('data', this.onData.bind(this))
        this._tty.on('close', () => console.log('debug: serialchan/close'))
        this._tty.on('end', () => console.log('debug: serialchan/end'))
        

        defered.resolve()
      }
    }.bind(this))

    return defered.promise
  }

  disconnect() {
    var defered = Q.defer()

    this._tty.close(
      function() {
        if (this._writer)
          this._writer.release()

        this._tty = undefined
        defered.resolve()
      }.bind(this),
      function(err) { defered.reject(err) })


    return defered.promise
  }

  addListener(ev, handler) {
    return this._tty.addListener(ev, handler)
  }

  removeListener(ev, handler) {
    return this._tty.removeListener(ev, handler)
  }

  write(buf, resp) {
    if (this._writer)
      return this._writer.write.apply(this._writer, arguments)
    else
      this._tty.write(buf)
  }
}

