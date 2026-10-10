import { Module, type DynamicModule } from '@nestjs/common';
import { HealthController } from './platform/health/health.controller.js';
import { DatabaseService } from './platform/database/database.service.js';
import type { PlatformConfig } from './platform/config/config.js';
@Module({})
export class AppModule {
  static configure(config:PlatformConfig):DynamicModule {
    return {module:AppModule,controllers:[HealthController],providers:[{provide:DatabaseService,useFactory:() => new DatabaseService(config)}]};
  }
}
