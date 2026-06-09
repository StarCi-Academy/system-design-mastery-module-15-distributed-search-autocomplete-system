# syntax=docker/dockerfile:1

# ---- Stage 1: build the Spring Boot jar ----
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml ./
RUN mvn -q dependency:go-offline || true
COPY src ./src
RUN mvn -q clean package -DskipTests

# ---- Stage 2: minimal JRE runtime ----
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /app/target/vector-search-service-1.0.0.jar app.jar
EXPOSE 3020
ENTRYPOINT ["java", "-jar", "app.jar"]
