import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { PublicErrorFilter } from './platform/http/error.filter.js';
import type { PlatformConfig } from './platform/config/config.js';
export async function createApplication(config:PlatformConfig) {
  const app = await NestFactory.create(AppModule.configure(config),{logger:false});
  app.setGlobalPrefix('api/v1');
  app.enableCors({origin:config.webOrigin});
  app.use((_request:any,response:any,next:()=>void) => {
    _request.correlationId = randomUUID();
    response.setHeader('X-Correlation-Id',_request.correlationId);
    response.setHeader('Cache-Control','no-store'); next();
  });
  app.useGlobalFilters(new PublicErrorFilter());
  const document = SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('EventLens API').setVersion('1.0.0').setDescription('Contrato REST explícito de la plataforma EventLens.').build());
  SwaggerModule.setup('api/docs',app,document,{jsonDocumentUrl:'api/v1/openapi.json'});
  return {app,document};
}
