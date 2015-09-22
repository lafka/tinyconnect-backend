#!/usr/bin/env node

import API from './api'
import Q from 'q'
import _ from 'lodash'
import yargs from 'yargs'

var args = yargs.argv

import {Frontend} from './frontend'
import SubProc from './subproc'
import WebSockets from './websockets'

args.workdir = args.workdir || "/tmp/tinyconnect"
var frontend = new Frontend(args)


if (args.websocket) {
  var
      managerOpts = {},
      websocketOpts = WebSockets.argsMapper(args)

  new WebSockets(websocketOpts, managerOpts, frontend)
}
