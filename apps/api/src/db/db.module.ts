import { Global, Module } from "@nestjs/common";
import { createDatabase, type Database } from "@webmana/db";

export const DATABASE = Symbol("DATABASE");

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): Database =>
        createDatabase(
          process.env.DATABASE_URL ??
            "postgres://webmana:webmana@localhost:5432/webmana",
        ),
    },
  ],
  exports: [DATABASE],
})
export class DbModule {}
