# ---- build stage ----
FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod ./
COPY main.go ./
RUN CGO_ENABLED=0 go build -o /hybrid-search-service .

# ---- runtime stage ----
FROM alpine:3.20 AS runtime
WORKDIR /app
COPY --from=build /hybrid-search-service ./hybrid-search-service
EXPOSE 3000
CMD ["./hybrid-search-service"]
