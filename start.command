#!/bin/bash
# Double-click to run Ruko on http://localhost:8790
cd "$(dirname "$0")"
open "http://localhost:8790" &
node server.js
