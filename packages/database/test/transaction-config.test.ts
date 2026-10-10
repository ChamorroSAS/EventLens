import { expect, it } from 'vitest';
import { PrismaTransactions, createPrismaClient } from '../src/index.js';
it('rejects invalid transaction bounds without opening a connection', async () => {
  const client = createPrismaClient('postgresql://unused:unused@localhost:5432/unused');
  for (const value of [0, -1, NaN, Infinity, 1.5]) expect(() => new PrismaTransactions(client, value)).toThrow('INVALID_TRANSACTION_TIMEOUT');
  await client.$disconnect();
});
