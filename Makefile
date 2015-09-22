.PHONY: build

NODEARCH=$(ARCH)
FILES=node-v$(NODEVSN)-$(PLATFORM)-$(NODEARCH).tar.gz
NODEVSN?=0.12.7
NODEURL=https://nodejs.org/download/release/v$(NODEVSN)
NODEURLSUFFIX=
FILES=
BUILDDIR=build

all:
	babel lib --out-dir src

watch:
	babel lib --out-dir src --watch

build:
	babel lib --out-dir src
	webpack

package: linux win32 darwin

win32: win32-x64 win32-ia32

linux: linux-x64 linux-ia32

# This builds a platform specific archive with the node.js runtime, all
# dependencies and the application itself. There is nothing special done to
# optimize the size of the archive (like removing node-pre-gyp etc).
# For building executable releases there is a set of scripts that helps
# optimizing the size as well as packaging it in a native way
win32-x64: ARCH=x64
win32-x64: PLATFORM=win32
win32-x64: NODEURLSUFFIX=x64
win32-x64: FILES=node.exe node.lib
win32-x64: fetch-files build-win32-x64

win32-ia32: ARCH=ia32
win32-ia32: PLATFORM=win32
win32-ia32: NODEARCH=x86
win32-ia32: FILES=node.exe node.lib
win32-ia32: fetch-files build-win32-ia32

linux-x64: ARCH=x64
linux-x64: PLATFORM=linux
linux-x64: FILES=node-v$(NODEVSN)-$(PLATFORM)-$(ARCH).tar.gz
linux-x64: fetch-gzip build-linux-x64

linux-ia32: ARCH=ia32
linux-ia32: PLATFORM=linux
linux-ia32: NODEARCH=x86
linux-ia32: FILES=node-v$(NODEVSN)-$(PLATFORM)-x86.tar.gz
linux-ia32: fetch-gzip build-linux-x64

darwin: ARCH=x64
darwin: PLATFORM=darwin
darwin: FILES=node-v$(NODEVSN)-$(PLATFORM)-$(NODEARCH).tar.gz
darwin: fetch-gzip build-darwin-x64

# Download $FILES to targetdir
fetch-files: TARGETDIR=$(BUILDDIR)/tinyconnect-$(PLATFORM)-$(NODEARCH)
fetch-files:
	@for file in $(FILES); do \
		url=$(NODEURL)$(NODEURLSUFFIX)/$$file; \
		cache=$(BUILDDIR)/.cache/$$(echo $$url | shasum | awk '{print $$1}'); \
		curl -z $$cache -o $$cache $$url; \
		mkdir -p $(TARGETDIR)/nodejs/$(NODEVSN); \
		cp $$cache $(TARGETDIR)/nodejs/$(NODEVSN)/$$file; \
	done;

# Download $FILES as gzip and extract it
fetch-gzip: TARGETDIR=$(BUILDDIR)/tinyconnect-$(PLATFORM)-$(NODEARCH)
fetch-gzip:
	mkdir -p $(TARGETDIR)/nodejs
	@for file in $(FILES); do \
		file=$(NODEURL)$(NODEURLSUFFIX)/$$file; \
		cache=$(BUILDDIR)/.cache/$$(echo $$file | shasum | awk '{print $$1}'); \
		echo "TRYING $$file; cache: $$cache"; \
		curl -z $$cache -o $$cache $$file; \
		mkdir -p $(TARGETDIR)/nodejs; \
		tar -xzf $$cache -C $(TARGETDIR)/nodejs; \
	done;

build-darwin-%: TARGETDIR=$(BUILDDIR)/tinyconnect-$(PLATFORM)-$(NODEARCH)
build-darwin-%: build force
	mkdir -p $(TARGETDIR)
	cp package.json $(TARGETDIR)
	$(BUILDDIR)/tinyconnect-linux-$(NODEARCH)/nodejs/node-v$(NODEVSN)-linux-$(NODEARCH)/bin/npm install --production --prefix $(TARGETDIR) --runtime=node --target_arch=$(ARCH) --target_platform=$(PLATFORM)
	cp -a src $(TARGETDIR)/lib
	cp -a dist $(TARGETDIR)/dist
	echo -e '#!/bin/sh\n./nodejs/node-v$(NODEVSN)-$(PLATFORM)-$(NODEARCH)/bin/node lib/main.js $$@' > $(TARGETDIR)/run.sh
	chmod +x $(TARGETDIR)/run.sh
	mkdir -p $(BUILDDIR)/dist
	(cd $(BUILDDIR) && tar -cvzf dist/tinyconnect-$(PLATFORM)-$(NODEARCH).tar.gz tinyconnect-$(PLATFORM)-$(NODEARCH)/)

build-linux-%: TARGETDIR=$(BUILDDIR)/tinyconnect-$(PLATFORM)-$(NODEARCH)
build-linux-%: build force
	mkdir -p $(TARGETDIR)
	cp package.json $(TARGETDIR)
	$(TARGETDIR)/nodejs/node-v$(NODEVSN)-$(PLATFORM)-$(NODEARCH)/bin/npm install --production --prefix $(TARGETDIR) --runtime=node --target_arch=$(ARCH) --target_platform=$(PLATFORM)
	cp -a src $(TARGETDIR)/lib
	cp -a dist $(TARGETDIR)/dist
	echo -e '#!/bin/sh\n./nodejs/node-v$(NODEVSN)-$(PLATFORM)-$(NODEARCH)/bin/node lib/main.js $$@' > $(TARGETDIR)/run.sh
	chmod +x $(TARGETDIR)/run.sh
	mkdir -p $(BUILDDIR)/dist
	(cd $(BUILDDIR) && tar -cvzf dist/tinyconnect-$(PLATFORM)-$(NODEARCH).tar.gz tinyconnect-$(PLATFORM)-$(NODEARCH)/)

build-win32-%: TARGETDIR=$(BUILDDIR)/tinyconnect-$(PLATFORM)-$(NODEARCH)
build-win32-%: build force
	mkdir -p $(TARGETDIR)
	cp package.json $(TARGETDIR)
	$(BUILDDIR)/tinyconnect-linux-$(NODEARCH)/nodejs/node-v$(NODEVSN)-linux-$(NODEARCH)/bin/npm install --production --prefix $(TARGETDIR) --runtime=node --target_arch=$(ARCH) --target_platform=$(PLATFORM)
	cp -a src $(TARGETDIR)/lib
	cp -a dist $(TARGETDIR)/dist
	(cd $(BUILDDIR) && zip -r -0 dist/tinyconnect-$(PLATFORM)-$(NODEARCH) tinyconnect-$(PLATFORM)-$(NODEARCH))


force: ;
