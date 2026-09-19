#!/bin/sh
# Run on macOS to produce build/icon.icns from the bundled .iconset
iconutil -c icns build/icon.iconset -o build/icon.icns
