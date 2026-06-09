# syntax=docker/dockerfile:1

# ---- Stage 1: build the Go binary ----
FROM golang:1.22 AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download || true
COPY . .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o /vector-search-service .

# ---- Stage 2: minimal runtime ----
FROM gcr.io/distroless/static-debian12
COPY --from=builder /vector-search-service /vector-search-service
EXPOSE 3020
ENTRYPOINT ["/vector-search-service"]
