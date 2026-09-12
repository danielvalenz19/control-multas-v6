import type { QueryValues } from "mysql2";
import type { Pool, PoolConnection, QueryResult } from "mysql2/promise";

export type DatabaseConnection = Pick<PoolConnection, "query">;

export type MySqlDatabase = {
  query: <T extends QueryResult>(sql: string, values?: QueryValues) => Promise<T>;
  withTransaction: <T>(work: (connection: PoolConnection) => Promise<T>) => Promise<T>;
};

export class MySqlConnection {
  public constructor(private readonly pool: Pool) {}

  public async query<T extends QueryResult>(sql: string, values: QueryValues = []): Promise<T> {
    const [result] = await this.pool.query<T>(sql, values);
    return result;
  }

  public async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  public async withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
