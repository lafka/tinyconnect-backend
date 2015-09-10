var
  child = require('child_process'),
  readline = require('readline')
  API = require('./src/api'),
  _ = require('lodash')

var fork = child.fork('src/main.js')

var onReady = function() {
}

var onResp = {}, ref = 0;
fork.on('message', function(msg) {
  if (msg.ev === 'ready')
    return onReady()

  if (msg.ev === 'data')
    console.log('recv/' + msg.channel, msg.buf.data)

  onResp[msg.ref] && onResp[msg.ref](msg)
})

var events = _.chain(Object.getOwnPropertyNames(API.prototype))
  .filter(function(buf) { return buf.match(/^ev:/) })
  .map(function(buf) { return buf.replace(/^ev:/, '') })
  .value().concat(['exit'])

var autocomplete = function(line) {
  var hits = events.filter(function(c) { return c.indexOf(line) == 0 })
  return [hits.length ? hits : events, line]
}

var interface = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: autocomplete
});

interface.setPrompt(' tm > ')
interface.prompt()
interface
  .on('line', function(line) {
    if ("exit" === line)
      return interface.close()

    if ("" === line)
      return interface.prompt()

    var
      retRef,
      parts = line.split(/(\s)/),
      event = parts.shift()

    try {
      fork.send.call(fork, {
        ev: event,
        ref: retRef = ++ref,
        arguments: parts.length > 0 ? eval("(" + parts.join('') + ")") : []
      })

      onResp[retRef] = function(resp) {
        process.stdout.write("#" + retRef + "> " + JSON.stringify(resp, null, 2) + "\r\n")
        delete onResp[retRef]
        interface.prompt()
      }
    } catch(e) {
      console.log("#> " + e.toString())
    }
  })
  .on('close', function() {
    fork.kill()
    fork.on('close', function() {
      console.log('Child exited!')
      process.exit(0)
    })

    setTimeout(function() {
      console.log('child not dead... kill it with fire!')
      fork.kill("SIGKILL")
    }, 1000)

    console.log("Have a nice flight!")
  })
