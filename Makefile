all:
	babel lib --out-dir src

watch:
	babel lib --out-dir src --watch
