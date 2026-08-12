FROM eclipse-temurin:21-jre-jammy

ARG GRAPHHOPPER_VERSION=11.0
ARG GRAPHHOPPER_SHA256=b59c024afe172ec6ec85b6327006c3138ec58c7d0bcd26253d0e42853f613def

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /graphhopper

RUN curl --fail --silent --show-error --location \
    --output "graphhopper-web-${GRAPHHOPPER_VERSION}.jar" \
    "https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/${GRAPHHOPPER_VERSION}/graphhopper-web-${GRAPHHOPPER_VERSION}.jar" \
  && echo "${GRAPHHOPPER_SHA256}  graphhopper-web-${GRAPHHOPPER_VERSION}.jar" | sha256sum --check

COPY infra/graphhopper/config.yml ./config.yml
COPY infra/graphhopper/custom-models ./infra/graphhopper/custom-models
COPY deployment/graphhopper-entrypoint.sh /usr/local/bin/graphhopper-entrypoint

RUN chmod 755 /usr/local/bin/graphhopper-entrypoint \
  && ln -s /data /graphhopper/data

ENTRYPOINT ["/usr/local/bin/graphhopper-entrypoint"]
