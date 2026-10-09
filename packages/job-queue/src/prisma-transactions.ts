import { PrismaClient, Prisma } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import type { SqlTransaction, TransactionRunner } from './contracts.js';
/** Prisma stays in infrastructure; generated models never cross this adapter. */
export class PrismaTransactions implements TransactionRunner {
  constructor(private readonly client:PrismaClient,private readonly timeoutMs:number){if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)throw new Error('INVALID_TRANSACTION_TIMEOUT');}
  run<T>(work:(tx:SqlTransaction)=>Promise<T>):Promise<T>{return this.client.$transaction(p=>work({
    query:<R extends object>(sql:string,...args:unknown[])=>p.$queryRawUnsafe<R[]>(sql,...args),
    execute:(sql:string,...args:unknown[])=>p.$executeRawUnsafe(sql,...args)
  }),{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,timeout:this.timeoutMs,maxWait:this.timeoutMs});}
}
export function createPrismaClient(connectionString:string):PrismaClient{return new PrismaClient({adapter:new PrismaPg({connectionString})});}
