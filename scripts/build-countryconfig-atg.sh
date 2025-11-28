#!/bin/bash
# Backward-compatible wrapper for building countryconfig-atg.
# Prefer using build-countryconfig.sh with --country=atg.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$SCRIPT_DIR/build-countryconfig.sh" "$@" --country=atg
