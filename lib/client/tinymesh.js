/**
 * implementation a subset of Tinymesh primitives
 */

//import {Command, Events} from 'tinymesh/parser
//import {Config, Calibration} from 'tinymesh/parser

export class Proto {
}

export class ConfigMode {
  constructor(syncWriter) {
    this._writer = syncWriter
  }

  // await until configuration mode is active
  await() {
    // await configuration mode prompt, the write double checks incase we are
    // there already
    this._writer.recv('>')
    this._writer.write('!', '>')
  }

  setNid(base36nid) {
    var nid = parseInt(base36nid, 36)

    this._writer.write('!', '>')
    this._writer.write('HW', '>')
    this._writer.write(new Buffer([
      23, 255 & nid >> 24,
      24, 255 & nid >> 16,
      25, 255 & nid >> 8,
      26, 255 & nid >> 0
    ]), '>')
  }

  setUid(addr) {
    this._writer.write('!', '>')
    this._writer.write('M', '>')
    this._writer.write(new Buffer([
      45, addr[0] || 0,
      46, addr[1] || 0,
      47, addr[2] || 0,
      48, addr[3] || 0
    ]), '>')
  }

  setSid(addr) {
    this._writer.write('!', '>')
    this._writer.write('M', '>')
    this._writer.write(new Buffer([
      49, addr[0] || 0,
      50, addr[1] || 0,
      51, addr[2] || 0,
      52, addr[3] || 0
    ]), '>')
  }

  makeGateway(addr) {
    this._writer.write('!', '>')
    this._writer.write('G', '>')
  }

  makeRouter() {
    this._writer.write('!', '>')
    this._writer.write('R', '>')
  }

  dumpConfig() {
    this._writer.write('!', '>')
    this._writer.write('0')
    this._writer.recv()
  }

  dumpCalibration() {
    this._writer.write('!', '>')
    this._writer.write('r')
    this._writer.recv()
  }

  setKey(n, key) {
    if (n < 0 || n > 7)
      throw new Error("setKey expects key number to be in range 0..7")

    if (16 !== key.length)
      throw new Error("setKey expects the key to be exactly 16 bytes long")

    this._writer.write('!', '>')
    this._writer.write('K' + n)
    this._writer.write(key, '>')
  }
}

