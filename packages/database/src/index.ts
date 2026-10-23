import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';
export const createDatabase = (url: string) => new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 8, connectionTimeoutMillis: 5000 }) });
export type Database = ReturnType<typeof createDatabase>;
export { Prisma } from './generated/client.js';
