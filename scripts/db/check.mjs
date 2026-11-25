import { connectDatabase, reportDatabaseError } from "./connection.mjs";
let sql;
try {
  for (const migration of [false, true]) {
    sql = connectDatabase({ migration });
    await sql.begin("read only", async (tx) => {
      await tx`select 1 as connection_ok`;
      const [result] =
        await tx`select count(*)::integer as tables from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
      console.log(
        `${migration ? "DIRECT_URL" : "DATABASE_URL"}: conexión OK; tablas públicas: ${result.tables}`,
      );
    });
    await sql.end({ timeout: 5 });
    sql = undefined;
  }
} catch (error) {
  reportDatabaseError(error);
} finally {
  if (sql) await sql.end({ timeout: 5 });
}
