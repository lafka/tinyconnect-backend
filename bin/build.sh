#!/bin/sh

set -e

if [ ! -e "package.json" ]; then
	echo "run from tinyconnect-backend root" >&2
	exit 1
fi

NODEVSN=${NODEVSN:-0.12.7}
NODEURL=${NODEURL:-https://nodejs.org/download/release/v${NODEVSN}}
builddir=${BUILDDIR:-./build}
CACHEDIR=${CACHEDIR:-./build/.cache}

vsn=$(awk '/version/{print $NF}' package.json | sed 's/[^0-9.]//g')

if [ -z "$*" ]; then
	echo "usage: $0 <platform>[<arch>]" >&2
	exit 1
fi


build=
# only build if it does not exist
preBuild=

while [ $# -gt 0 ]; do
	case "$1" in
		win32)     build="$build win32_x64 win32_x86"; preBuild="$preBuild linux_x64 linux_x86" ;;
		win32:x64) build="$build win32_x64";           preBuild="$preBuild linux_x64" ;;
		win32:x86) build="$build win32_x86";           preBuild="$preBuild linux_x86" ;;

		darwin)     build="$build darwin_x64" preBuild="$preBuild linux_x64" ;;
		darwin:x64) build="$build darwin_x64" preBuild="$preBuild linux_x64" ;;

		linux)     build="$build linux_x64 linux_x86" ;;
		linux:x64) build="$build linux_x64" ;;
		linux:x86) build="$build linux_x86" ;;

		*)
			echo "ERROR: unknown target $1" >&2;
			exit 1
			;;
	esac
	shift
done

run() {
	build=$(echo "$build" | tr ' ' '\n' | sort -u)
	preBuild=$(echo "$preBuild" | tr ' ' '\n' | sort -u)

	echo " => pre-build"
	for f in $preBuild; do echo  "	$f"; done

	echo  "
	 => build"
	for f in $build; do echo "	$f"; done

	echo

	buildt=
	for f in $preBuild $build; do
		echo "$buildt" | grep -q "$f" && continue
		echo
		echo " => Building $f"
		buildt="$buildt $f"

		eval "$f"
	done
}

targetdir() {
	local arch=$1
	local platform=$2
	if command -v realpath > /dev/null; then
		echo "$(realpath $builddir)/$vsn/$platform${arch:+-$arch}"
	else
		echo "$builddir/$vsn/$platform${arch:+-$arch}"
	fi
}

installnode() {
	local targetdir="$1"
	local nodevsn="$2"
	local arch="$3"
	local platform=$4

	local files
	local archive=0
	case "$platform:$arch" in
		win32:x86) archive=1; files="node.exe node.lib" ;;
		win32:x64) archive=1; files="x64/node.exe x64/node.lib" ;;

		darwin:*|linux:*)
			archive=0
			files="node-v${nodevsn}-${platform}-${arch}.tar.gz"
			;;

		*)
			echo "ERROR: unknown node platform $platform" >&2;
			exit
	esac

	local url
	for file in $files; do
		if [ 0 -eq "$archive" ] && [ -d "$targetdir/node/$nodevsn" ]; then
			echo " :: using cached version of $file ($targetdir/node/$nodevsn)"
			continue
		elif [ 1 -eq "$archive" ] && [ -e "$targetdir/node/$nodevsn/$(basename "$file")" ]; then
			echo " :: using cached version of $file ($targetdir/node/$nodevsn/$file)"
			continue
		fi

		url="$NODEURL/$file"
		cache="$CACHEDIR/$(echo "$url" | shasum | awk '{print $1}')"
		echo " :: downloading $file"
		curl -z "$cache" -o "$cache" "$url"
		mkdir -p "$targetdir/node/$nodevsn"

		if [ 0 -eq "$archive" ]; then
			echo ":: extracting nodejs"
			tar -xzf "$cache" -C "$targetdir/node/$nodevsn" --strip-components=1
		else
			mkdir -p "$targetdir/node/$NODEVSN"
			cp -v "$cache" "$targetdir/node/$nodevsn/$(basename "$file")"
		fi
	done
}

syncapp() {
	targetdir="$1"
	apptarget="$targetdir/app/$vsn"

	echo " :: appdir: $apptarget"
	mkdir -p "$apptarget"

	cp package.json "$apptarget"
	cp -a app "$apptarget"
	cp -a dist "$apptarget"
}

npminstall() {
	local targetdir="$1"
	local nodevsn="$2"
	local appvsn="$3"
	local arch="$4"
	local serialarch="$5"
	local platform="$6"

	local npmbin
	npmbin="$(targetdir "$arch" linux)/work/node/$nodevsn/bin/npm"

	$npmbin install \
		--production \
		--cache-min=9999999 \
		--prefix="$targetdir/app/$appvsn" \
		--runtime=node \
		--target_platform="$platform" \
		--target_arch="$serialarch"
}

build() {
	local targetdir="$1"
	local vsn="$2"
	local arch="$3"
	local serialarch="$4"
	local platform="$5"

	local workdir="$targetdir/work"
	local distdir="$targetdir/dist"

	mkdir -p "$workdir" "$distdir"

	echo " :: workdir: $workdir"
	echo " :: distdir: $distdir"

	installnode "$workdir" "$NODEVSN" "$arch" "$platform"
	syncapp "$workdir"

	npminstall "$workdir" "$NODEVSN" "$vsn" "$arch" "$serialarch" "$platform"
	striplist=$PWD/bin/striplist
	( cd "$workdir"; (
		find "$workdir/node" -name node -or -name '*.so';
		find "$workdir/app/$vsn/dist";
		find "$workdir/app/$vsn/node_modules" -type f -name '*.node' -or -name 'routes.json' -or -name 'xdg-open';
		find "$workdir/app/$vsn/node_modules" -type f -wholename '*/api/v*/*.js';
		$striplist \
			"$workdir/app/$vsn/app/main.js" \
			"$workdir/app/$vsn/node_modules/node-forge/js/"*.js;
	) | sed "s~$workdir~.~" | xargs cp -a --parent -t "$distdir")

}

linux_x86()  { build "$(targetdir x86 linux)"  "$vsn" x86 ia32 linux; }
linux_x64()  { build "$(targetdir x64 linux)"  "$vsn" x64 x64  linux; }
win32_x86()  { build "$(targetdir x86 win32)"  "$vsn" x86 ia32 win32; }
win32_x64()  { build "$(targetdir x64 win32)"  "$vsn" x64 x64  win32; }
darwin_x64() { build "$(targetdir x64 darwin)" "$vsn" x64 x64  darwin; }

#make build
run

echo
echo " ==================================================================== "
echo "                                  DONE"
echo " ==================================================================== "
