import API from './api'
import Q from 'q'
import _ from 'lodash'
import yargs from 'yargs'

var args = yargs.argv

import {Frontend} from './frontend'
import SubProc from './subproc'
import WebSockets from './websockets'

if (!args.workdir) {
  var parts = __dirname.split('/app/')
  if (parts.length != 2) {
    console.log("ERROR: this script should recide under './app/<vsn>/lib', set --workdir manually")
    process.exit(1)
  }

  args.workdir = parts[0]
}

var frontend = new Frontend(args)


if (args.websocket) {
  var
      managerOpts = {},
      websocketOpts = WebSockets.argsMapper(args)

  new WebSockets(websocketOpts, managerOpts, frontend)
}
