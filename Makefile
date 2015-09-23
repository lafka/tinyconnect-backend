.PHONY: build

all: build

watch:
	babel lib --out-dir app --watch
	webpack --progress --config webpack-pkg.config.js

build:
	webpack --progress
	babel lib --out-dir app

clean:
	rm -rf build/*.*.*

package:
	bin/build.sh linux win32 darwin
