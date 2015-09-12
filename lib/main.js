#!/usr/bin/env node

import API from './api'
import Q from 'q'
import _ from 'lodash'

var args = process.argv.slice(2)

import SubProc from './subproc'
import WebSockets from './websockets'

switch(args[0]) {
  case "child":
    console.log("starting sub-process api")
    new SubProc()
    break

  case "websockets":
    console.log("starting websockets api")
    new WebSockets()
    break

  default:
    console.log("unknown API: " + args[0])
    process.exit(1)
}
