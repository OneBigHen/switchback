#!/usr/bin/env sh
set -eu

sed 's/bind_host: 127.0.0.1/bind_host: 0.0.0.0/g' \
  /graphhopper/config.yml > /tmp/graphhopper-config.yml

exec java -Xms1g -Xmx4g -XX:+UseParallelGC \
  -jar /graphhopper/graphhopper-web-11.0.jar \
  server /tmp/graphhopper-config.yml
