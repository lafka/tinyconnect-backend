var Crypto = require('../src/crypto.js')


var server = new Crypto({id: 'server', state: 'init-keyex'})
var client = new Crypto({id: 'client', state: 'recv-keyex'})



// this sets up the keyexchange
client.input( // stores the symkey from server reply
  server.input( // takes client pubkey and returns symkey
    client.input( // takes servers pubkey, respond with itsown
      server.init() // outputs PEM public key
    )
  )
)

var
  req = {a: 1},
  rep = client.input(server.output('server-req', JSON.stringify(req)))

if (req.a !== rep.data.a)
  console.log('server input did not match on client side!')


req = {b: 1},
rep = server.input(client.output('client-req', JSON.stringify(req)))

if (req.b !== rep.data.b)
  console.log('client input did not match server output!')
