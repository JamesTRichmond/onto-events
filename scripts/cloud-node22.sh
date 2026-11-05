#!/bin/sh
# ONTO Cloud only. Invoke with: sh scripts/cloud-node22.sh <command> [args...]
# Keep runtime selection inside this process; never source this file.

if [ "$#" -eq 0 ]; then
    echo "Usage: sh scripts/cloud-node22.sh <command> [args...]" >&2
    exit 64
fi

if [ "${ONTO_CLOUD_NODE22_BIN+x}" = x ]; then
    case "$ONTO_CLOUD_NODE22_BIN" in
        /*) ;;
        *) echo "ONTO Cloud: ONTO_CLOUD_NODE22_BIN must be an absolute bin directory." >&2; exit 1 ;;
    esac
    node22_bin=$ONTO_CLOUD_NODE22_BIN
else
    node22_bin=
    for candidate in /workspace/.runtime/node-22.*/node_modules/node/bin; do
        [ -x "$candidate/node" ] || continue
        version=$("$candidate/node" --version 2>/dev/null) || continue
        case "$version" in
            v22.*) node22_bin=$candidate; break ;;
        esac
    done
fi

if [ -z "$node22_bin" ] || [ ! -x "$node22_bin/node" ]; then
    echo "ONTO Cloud: installed Node 22 unavailable. Provision it in the Cloud environment or set ONTO_CLOUD_NODE22_BIN to its absolute bin directory." >&2
    exit 1
fi

PATH="$node22_bin:$PATH"
export PATH
version=$(node --version 2>/dev/null) || {
    echo "ONTO Cloud: could not run Node 22 from $node22_bin." >&2
    exit 1
}
case "$version" in
    v22.*) ;;
    *) echo "ONTO Cloud: expected Node 22 from $node22_bin, got $version." >&2; exit 1 ;;
esac

exec "$@"
