import { registerAs } from "@nestjs/config"

/**
 * Postgres connection settings, read from the environment so the same image
 * runs unchanged under Docker Compose (PG_HOST=postgres) or locally.
 */
export const pgConfig = registerAs("pg", () => ({
    host: process.env.PG_HOST ?? "localhost",
    port: parseInt(process.env.PG_PORT ?? "5432", 10),
    user: process.env.PG_USER ?? "search",
    password: process.env.PG_PASSWORD ?? "search",
    database: process.env.PG_DATABASE ?? "vectorsearch",
}))
