# Build and test on Alpine (musl → a static binary), run from scratch.
FROM rust:1.99-alpine AS build
RUN apk add --no-cache musl-dev cmake make perl
WORKDIR /src
COPY . .
RUN cargo test --release --locked && cargo build --release --locked
RUN mkdir -p /data-empty

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /src/target/release/questlog /questlog
COPY --from=build --chown=65534:65534 /data-empty /data
USER 65534:65534
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt DATA_DIR=/data PORT=8080
EXPOSE 8080
ENTRYPOINT ["/questlog"]
