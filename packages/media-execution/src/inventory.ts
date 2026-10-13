import {PrismaClient} from './generated/prisma/client.js';
import {PrismaPg} from '@prisma/adapter-pg';
import {assertTestConnectionUrl,assertTestDatabase} from '@eventlens/database/testing';
import type {AttemptInventory,AttemptRecord} from './contracts.js';
import {ExecutionError} from './contracts.js';
/** Generated Prisma models are confined to this infrastructure adapter. */
export class PrismaAttemptInventory implements AttemptInventory {
 constructor(private readonly client:PrismaClient){}
 async begin(record:AttemptRecord):Promise<void>{
  try {await this.client.executionInventory.create({data:{id:record.id,token:record.token,phaseId:record.phaseId??'processing',status:record.status,record:JSON.parse(JSON.stringify(record))}});}
  catch(error){if((error as {code?:string}).code==='P2002')throw new ExecutionError('ATTEMPT_ALREADY_EXISTS');throw error;}
 }
 async update(record:AttemptRecord):Promise<void>{
  const result=await this.client.executionInventory.updateMany({where:{id:record.id,token:record.token,status:{not:'QUIESCENT'}},data:{status:record.status,record:JSON.parse(JSON.stringify(record)),updatedAt:new Date()}});
  if(result.count!==1)throw new Error('INVENTORY_UPDATE_REJECTED');
 }
 async get(id:string):Promise<AttemptRecord|null>{const row=await this.client.executionInventory.findUnique({where:{id}});return row?row.record as unknown as AttemptRecord:null;}
 async pending(limit:number,afterId?:string):Promise<AttemptRecord[]>{if(!Number.isSafeInteger(limit)||limit<=0)throw new ExecutionError('INVALID_CONFIG');const rows=await this.client.executionInventory.findMany({where:{status:{not:'QUIESCENT'},...(afterId?{id:{gt:afterId}}:{})},orderBy:{id:'asc'},take:limit});return rows.map(row=>row.record as unknown as AttemptRecord);}
}
export function createInventoryClient(connectionString:string):PrismaClient{
 const testing=process.env.VITEST!==undefined||process.env.NODE_ENV==='test';
 if(testing)assertTestConnectionUrl(connectionString);
 const client=new PrismaClient({adapter:new PrismaPg({connectionString})});
 if(!testing)return client;
 const verify=()=>assertTestDatabase({query:<T extends object>(sql:string,...args:unknown[])=>client.$queryRawUnsafe<T[]>(sql,...args)});
 return client.$extends({query:{$allOperations:async({args,query})=>{await verify();return query(args);}}}) as unknown as PrismaClient;
}
