import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service.js';
export const readySchema = {type:'object',required:['status'],properties:{status:{type:'string',enum:['ready']}}};
export const liveSchema = {type:'object',required:['status'],properties:{status:{type:'string',enum:['alive']}}};
export const errorSchema = {type:'object',required:['code','message','correlationId'],properties:{code:{type:'string'},message:{type:'string'},correlationId:{type:'string',format:'uuid'}}};
@ApiTags('platform')
@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database:DatabaseService) {}
  @Get('live')
  @ApiOperation({operationId:'getLiveness',summary:'Comprobar que la API está activa'})
  @ApiResponse({status:200,schema:liveSchema})
  live():{status:'alive'} { return {status:'alive'}; }
  @Get('ready')
  @ApiOperation({operationId:'getReadiness',summary:'Comprobar disponibilidad de PostgreSQL'})
  @ApiResponse({status:200,schema:readySchema})
  @ApiResponse({status:503,schema:errorSchema})
  async ready():Promise<{status:'ready'}> {
    try { await this.database.ping(); return {status:'ready'}; }
    catch { throw new ServiceUnavailableException(); }
  }
}
