import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({
  PrismaClient: vi.fn(),
  PrismaPg: vi.fn(),
  rawQuery: vi.fn(),
  extend: vi.fn(),
  operation: undefined as undefined | ((args: { args: unknown; query: (args: unknown) => Promise<unknown> }) => Promise<unknown>),
  baseClient: {} as Record<string, unknown>,
  extendedClient: {} as Record<string, unknown>,
}));

vi.mock('../src/generated/prisma/client.js', () => ({ PrismaClient: mocks.PrismaClient }));
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: mocks.PrismaPg }));

import { createInventoryClient } from '../src/inventory.js';

const policyEnv = {
  EVENTLENS_TEST_DATABASE: `el_test_${'a'.repeat(32)}`,
  EVENTLENS_TEST_ROLE: `el_test_role_${'a'.repeat(32)}`,
  EVENTLENS_TEST_TOKEN: 'b'.repeat(64),
};
const connectionString = `postgresql://${policyEnv.EVENTLENS_TEST_ROLE}:secret@localhost/${policyEnv.EVENTLENS_TEST_DATABASE}`;
const identity = {
  database: policyEnv.EVENTLENS_TEST_DATABASE,
  role: policyEnv.EVENTLENS_TEST_ROLE,
  owner: policyEnv.EVENTLENS_TEST_ROLE,
  marker: `eventlens-test-v1:${createHash('sha256').update(policyEnv.EVENTLENS_TEST_TOKEN).digest('hex')}`,
  privileged: false,
};

describe('media inventory test database guard', () => {
  beforeEach(() => {
    vi.stubEnv('VITEST', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    for (const [name, value] of Object.entries(policyEnv)) vi.stubEnv(name, value);
    mocks.operation = undefined;
    mocks.rawQuery.mockReset().mockResolvedValue([identity]);
    mocks.extend.mockReset().mockImplementation((extension: { query: { $allOperations: typeof mocks.operation } }) => {
      mocks.operation = extension.query.$allOperations;
      return mocks.extendedClient;
    });
    mocks.baseClient = {
      $queryRawUnsafe: mocks.rawQuery,
      $extends: mocks.extend,
    };
    mocks.extendedClient = { extended: true };
    mocks.PrismaPg.mockClear();
    mocks.PrismaPg.mockImplementation(function (options: unknown) { return { options }; });
    mocks.PrismaClient.mockClear();
    mocks.PrismaClient.mockImplementation(function () { return mocks.baseClient; });
  });

  it('checks the effective identity before allowing a Prisma operation', async () => {
    const client = createInventoryClient(connectionString);
    const delegate = vi.fn().mockResolvedValue('query-result');

    await expect(mocks.operation!({ args: { where: { id: 'attempt' } }, query: delegate })).resolves.toBe('query-result');

    expect(mocks.rawQuery).toHaveBeenCalledTimes(1);
    expect(mocks.rawQuery.mock.invocationCallOrder[0]).toBeLessThan(delegate.mock.invocationCallOrder[0]);
    expect(delegate).toHaveBeenCalledWith({ where: { id: 'attempt' } });
    expect(client).toBe(mocks.extendedClient);
  });

  it.each([
    ['an effective database mismatch', async () => mocks.rawQuery.mockResolvedValue([{ ...identity, database: 'eventlens' }])],
    ['a failed PostgreSQL identity query', async () => mocks.rawQuery.mockRejectedValue(new Error('POSTGRES_UNAVAILABLE'))],
  ])('blocks the Prisma operation on %s', async (_case, arrange) => {
    await arrange();
    createInventoryClient(connectionString);
    const delegate = vi.fn().mockResolvedValue('must-not-run');

    await expect(mocks.operation!({ args: {}, query: delegate })).rejects.toThrow();
    expect(delegate).not.toHaveBeenCalled();
  });

  it('rejects a test connection without runner-issued isolation policy before constructing Prisma', () => {
    for (const name of Object.keys(policyEnv)) vi.stubEnv(name, '');

    expect(() => createInventoryClient('postgresql://role:secret@localhost/eventlens')).toThrow('TEST_ISOLATION_REQUIRED');
    expect(mocks.PrismaClient).not.toHaveBeenCalled();
  });

  it('returns the ordinary client outside test mode', () => {
    const vitestEnv = process.env.VITEST;
    delete process.env.VITEST;
    vi.stubEnv('NODE_ENV', 'development');

    try {
      expect(createInventoryClient('postgresql://role:secret@localhost/eventlens')).toBe(mocks.baseClient);
      expect(mocks.extend).not.toHaveBeenCalled();
    } finally {
      if (vitestEnv !== undefined) process.env.VITEST = vitestEnv;
    }
  });
});
