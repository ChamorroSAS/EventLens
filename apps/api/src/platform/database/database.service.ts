import { createPrismaClient, PrismaTransactions, type TransactionRunner } from '@eventlens/database';
import type { OnModuleDestroy } from '@nestjs/common';
import type { PlatformConfig } from '../config/config.js';
/** Prisma is infrastructure; health never exposes ORM models. */
export class DatabaseService implements OnModuleDestroy {
  private readonly client;
  readonly transactions:TransactionRunner;
  constructor(config:PlatformConfig) {
    this.client = createPrismaClient(config.databaseUrl,{connectionTimeoutMillis:config.databaseTimeoutMs,query_timeout:config.databaseTimeoutMs,max:2});
    this.transactions = new PrismaTransactions(this.client,config.databaseTimeoutMs);
  }
  async ping():Promise<void> { await this.client.$queryRaw`SELECT 1`; }
  async onModuleDestroy():Promise<void> { await this.client.$disconnect(); }
}
