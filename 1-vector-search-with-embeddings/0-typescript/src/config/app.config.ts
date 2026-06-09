import { registerAs } from "@nestjs/config"

/**
 * Application-level settings: the HTTP port the service binds to and the
 * embedding dimensionality (fixed by the all-MiniLM-L6-v2 model = 384).
 */
export const appConfig = registerAs("app", () => ({
    port: parseInt(process.env.PORT ?? "3020", 10),
    dimensions: 384,
}))
