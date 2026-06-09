import { Provider } from "@nestjs/common"
import { ConfigType } from "@nestjs/config"
import { Pool } from "pg"
import { pgConfig } from "../config"

export const PG_POOL = "PG_POOL"

/**
 * Single shared pg Pool, configured from pgConfig. Reused by the repository so
 * connections are pooled rather than opened per request.
 */
export const pgPoolProvider: Provider = {
    provide: PG_POOL,
    inject: [pgConfig.KEY],
    useFactory: (config: ConfigType<typeof pgConfig>): Pool =>
        new Pool({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
        }),
}
