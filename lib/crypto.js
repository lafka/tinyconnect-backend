var forge = require('node-forge')({disableNativeCode: true})

export default class Crypto {
  constructor(opts) {
    opts = opts || {}
    // @todo load keys from disk or something

    this._type  = opts.type || 'server'
    this._id = opts.id || 'crypto'
    this._keys = opts.keypair || Crypto.newKeyPair()
    this._remoteKey = null
    this._symkey = null
    this._cipher = null
    this._decipher = null

    this._handler = undefined
    this.await(opts.state)

    this.onReady = opts.onReady

    console.log(this._id + '/fingerprint ' + this.fingerprint(this._keys.publicKey))
  }

  static newKeyPair() {
    return forge.pki.rsa.generateKeyPair({bits: 512});
  }

  await(nextState) {
    if (!this['state:' + nextState])
      throw new Error(this._id + ": no such state '" + nextState + "'")

    this._handler = this['state:' + nextState].bind(this)
  }

  fingerprint(key) {
    return forge.pki.getPublicKeyFingerprint(key, {encoding: 'hex', delimiter: ':'})
  }

  outputAES(event, buf) {
    if (!this._cipher)
      throw new Error('no AES cipherer present. Did you exchange keys?')

    var iv = forge.random.getBytesSync(16)

    this._cipher.start({
      iv: iv,
      tagLength: 128
    })

    this._cipher.update(forge.util.createBuffer(event + ' ' + buf))
    this._cipher.finish()

    return iv + this._cipher.mode.tag.getBytes() + this._cipher.output.getBytes()
  }

  parseAES(buf) {
    var
      iv = buf.slice(0, 16),
      tag = buf.slice(16, 32),
      ciphertext = buf.slice(32)


    this._decipher.start({
      iv: iv,
      tagLength: 128,
      tag: tag
    })
    this._decipher.update(forge.util.createBuffer(ciphertext))
    var pass = this._decipher.finish()

    if (pass) {
      var
        output = this._decipher.output.getBytes().split(/ /),
        data = output.slice(1).join(' ')

      return {
        ev: output[0],
        data: data && 'string' === typeof(data) ? JSON.parse(data) : data
      }
    }
  }

  // this is for the connected party
  'state:init-keyex'() {
    this.await('reply-keyex')

    return forge.pki.publicKeyToPem(this._keys.publicKey)
  }

  'state:reply-keyex'(buf) {
    this._remoteKey = forge.pki.publicKeyFromPem(buf)

    var
      kdf = new forge.kem.kdf1(forge.md.sha256.create()),
      kem = forge.kem.rsa.create(kdf),
      res = kem.encrypt(this._remoteKey, 16)

    this._cipher = forge.cipher.createCipher('AES-GCM', res.key)
    this._decipher = forge.cipher.createDecipher('AES-GCM', res.key)

    this.await('recv-data')

    if (this.onReady)
      setTimeout(this.onReady, 1)

    return res.encapsulation
  }

  'state:recv-data'(buf) {
    var ev = this.parseAES(buf)

    return ev
  }

  // this is for the connecting party
  'state:recv-keyex'(buf) {
    this._remoteKey = forge.pki.publicKeyFromPem(buf)
    console.log(this._id + '/remote-fingerprint ' + this.fingerprint(this._remoteKey))

    this.await('finish-keyex')
    return forge.pki.publicKeyToPem(this._keys.publicKey)
  }

  'state:finish-keyex'(cipher) {
    var
      kdf = new forge.kem.kdf1(forge.md.sha256.create()),
      kem = forge.kem.rsa.create(kdf),
      key = kem.decrypt(this._keys.privateKey, cipher, 16)

    this._cipher = forge.cipher.createCipher('AES-GCM', key)
    this._decipher = forge.cipher.createDecipher('AES-GCM', key)

    if (this.onReady)
      setTimeout(this.onReady, 1)

    this.await('recv-data')
  }

  init() {
    return this._handler()
  }

  input(buf, callback) {
    var ret = this._handler(buf)

    if (callback)
      callback(ret)

    return ret
  }

  output(event, buf) {
    if (!event)
      throw new Error('first argument (event) is required)')

    return this.outputAES(event, undefined === buf ? '' : buf.toString())
  }
}



// var crypto = new Crypto()
// crypto.init()
// #> undefined || `buf`, in this case it would return `send-pubkey`
// crypto.input("the pubkey") // received some data from somewhere
// #> undefined || `buf`, this would be public key of the server
// crypto.input("remote pubkey)
// #> undefined || `buf`, this would be a ciphertext including the iv, tag and aes key
// crypto.input('garble', (data) => <callback with the plaintext>)
// #> undefined || `buf`, for data it would just do the callback
// crypto.output(plaintext)
// #> `buf` with cipher text using the symtertical key
