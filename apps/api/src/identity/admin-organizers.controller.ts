import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { extractHostAdminSessionCookie } from '@eventlens/identity';
import { AdminOrganizersService } from './admin-organizers.service.js';
import { errorSchema } from '../platform/health/health.controller.js';
type Request={headers?:Record<string,string|string[]|undefined>};
type Response={setHeader(name:string,value:string):void};
function header(request:Request,name:string){const raw=request.headers?.[name];return Array.isArray(raw)?undefined:raw;}
const organizerSchema={type:'object',required:['id','email','displayName','status','passwordChangeRequired','temporaryPasswordExpiresAt','revision','createdAt','updatedAt','emailVerified','provisioningSource'],properties:{provisioningSource:{type:'string',enum:['INVITATION','ADMIN_PROVISIONED']},id:{type:'string',format:'uuid'},email:{type:'string',format:'email'},displayName:{type:'string',nullable:true},status:{type:'string'},passwordChangeRequired:{type:'boolean'},temporaryPasswordExpiresAt:{type:'string',format:'date-time',nullable:true},revision:{type:'string'},createdAt:{type:'string',format:'date-time'},updatedAt:{type:'string',format:'date-time'},emailVerified:{type:'boolean'}}};
const mutationSchema={type:'object',required:['organizer','outcome','temporaryPassword'],properties:{organizer:organizerSchema,outcome:{type:'string'},temporaryPassword:{type:'string',nullable:true}}};
const common={reason:{type:'string',minLength:1,maxLength:500},idempotencyKey:{type:'string',format:'uuid'}};
const actionSchema={type:'object',additionalProperties:false,required:['reason','idempotencyKey','expectedRevision'],properties:{...common,expectedRevision:{type:'string',pattern:'^[1-9][0-9]*$'}}};
const createSchema={type:'object',additionalProperties:false,required:['email','reason','idempotencyKey'],properties:{...common,email:{type:'string',format:'email'},displayName:{type:'string',maxLength:120,nullable:true}}};
const updateSchema={...actionSchema,required:[...actionSchema.required,'displayName'],properties:{...actionSchema.properties,displayName:{type:'string',nullable:true,maxLength:120}}};

@ApiTags('identity')
@Controller('admin/organizers')
@ApiResponse({status:401,schema:errorSchema})
@ApiResponse({status:403,schema:errorSchema})
@ApiResponse({status:409,schema:errorSchema})
@ApiResponse({status:422,schema:errorSchema})
@ApiResponse({status:503,schema:errorSchema})
export class AdminOrganizersController {
 constructor(@Inject(AdminOrganizersService) private readonly service:AdminOrganizersService){}
 private input(request:Request,response:Response){response.setHeader('Cache-Control','no-store');return {sessionToken:extractHostAdminSessionCookie(header(request,'cookie')),csrfToken:header(request,'x-csrf-token'),origin:header(request,'origin')};}
 @Get()
 @ApiOperation({operationId:'listAdminOrganizers'})
 @ApiQuery({name:'limit',required:false,type:Number}) @ApiQuery({name:'offset',required:false,type:Number}) @ApiQuery({name:'search',required:false,type:String})
 @ApiResponse({status:200,schema:{type:'object',required:['items','total','limit','offset'],properties:{items:{type:'array',items:organizerSchema},total:{type:'integer'},limit:{type:'integer'},offset:{type:'integer'}}}})
 list(@Req() request:Request,@Res({passthrough:true}) response:Response,@Query() query:{limit?:string;offset?:string;search?:string}){return this.service.list(this.input(request,response),{limit:query.limit===undefined?undefined:Number(query.limit),offset:query.offset===undefined?undefined:Number(query.offset),search:query.search});}
 @Get(':accountId') @ApiOperation({operationId:'getAdminOrganizer'}) @ApiResponse({status:200,schema:organizerSchema})
 get(@Req() request:Request,@Res({passthrough:true}) response:Response,@Param('accountId') id:string){return this.service.get(this.input(request,response),id);}
 @Post() @ApiOperation({operationId:'createAdminOrganizer'}) @ApiBody({schema:createSchema}) @ApiResponse({status:201,schema:mutationSchema})
 create(@Req() request:Request,@Res({passthrough:true}) response:Response,@Body() body:unknown){return this.service.mutate(this.input(request,response),'CREATE',undefined,body);}
 @Patch(':accountId') @ApiOperation({operationId:'updateAdminOrganizer'}) @ApiBody({schema:updateSchema}) @ApiResponse({status:200,schema:mutationSchema})
 update(@Req() request:Request,@Res({passthrough:true}) response:Response,@Param('accountId') id:string,@Body() body:unknown){return this.service.mutate(this.input(request,response),'UPDATE',id,body);}
 @Post(':accountId/disable') @HttpCode(200) @ApiOperation({operationId:'disableAdminOrganizer'}) @ApiBody({schema:actionSchema}) @ApiResponse({status:200,schema:mutationSchema})
 disable(@Req() request:Request,@Res({passthrough:true}) response:Response,@Param('accountId') id:string,@Body() body:unknown){return this.service.mutate(this.input(request,response),'DISABLE',id,body);}
 @Post(':accountId/enable') @HttpCode(200) @ApiOperation({operationId:'enableAdminOrganizer'}) @ApiBody({schema:actionSchema}) @ApiResponse({status:200,schema:mutationSchema})
 enable(@Req() request:Request,@Res({passthrough:true}) response:Response,@Param('accountId') id:string,@Body() body:unknown){return this.service.mutate(this.input(request,response),'ENABLE',id,body);}
 @Post(':accountId/temporary-password') @HttpCode(200) @ApiOperation({operationId:'resetAdminOrganizerTemporaryPassword'}) @ApiBody({schema:actionSchema}) @ApiResponse({status:200,schema:mutationSchema})
 reset(@Req() request:Request,@Res({passthrough:true}) response:Response,@Param('accountId') id:string,@Body() body:unknown){return this.service.mutate(this.input(request,response),'RESET_TEMPORARY_PASSWORD',id,body);}
}
