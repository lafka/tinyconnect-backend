#!/bin/sh

set -ex

make clean
make linux-ia32
make linux-x64
make win32-ia32
make win32-x64
make darwin
