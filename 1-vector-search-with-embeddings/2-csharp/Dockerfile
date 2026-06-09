# syntax=docker/dockerfile:1

# ---- Stage 1: build and publish ----
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder
WORKDIR /app
COPY VectorSearchService.csproj ./
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /out

# ---- Stage 2: ASP.NET runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runner
WORKDIR /app
COPY --from=builder /out ./
EXPOSE 3020
ENTRYPOINT ["dotnet", "VectorSearchService.dll"]
