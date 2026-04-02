#!/bin/sh
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:$PATH"
exec node node_modules/.bin/next dev --port 3000
