#!/bin/bash

ROOT=$PWD/node_modules/monaco-editor/esm/vs
OPTS="--no-source-maps"
PATH="$PATH:$PWD/node_modules/.bin"

# parcel build $ROOT/language/json/json.worker.js $OPTS
# parcel build $ROOT/language/css/css.worker.js $OPTS
# parcel build $ROOT/language/html/html.worker.js $OPTS
parcel build $ROOT/language/typescript/ts.worker.js $OPTS
parcel build $ROOT/editor/editor.worker.js $OPTS
