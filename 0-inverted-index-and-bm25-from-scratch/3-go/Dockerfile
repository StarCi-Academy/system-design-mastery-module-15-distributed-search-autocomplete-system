# ---- build stage ----
FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod ./
RUN go mod download || true
COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -o /bm25-search-service .

# ---- runtime stage ----
FROM alpine:3.20 AS runtime
WORKDIR /app
COPY --from=build /bm25-search-service /app/bm25-search-service
EXPOSE 3000
CMD ["/app/bm25-search-service"]
