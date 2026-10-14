import { Module, type DynamicModule } from '@nestjs/common';
import { HealthController } from './platform/health/health.controller.js';
import { DatabaseService } from './platform/database/database.service.js';
import { OrganizerSessionController } from './identity/organizer-session.controller.js';
import {
  ORGANIZER_SESSION_CONFIG,
  OrganizerSessionService
} from './identity/organizer-session.service.js';
import {
  BetaAccessRequestController,
  PublicBetaAccessRequestAdapterService
} from './identity/beta-access-request.controller.js';
import {
  OrganizerAccountController,
  OrganizerAccountService
} from './identity/organizer-account.controller.js';
import {
  OrganizerEventsController,
  OrganizerEventsService
} from './events/organizer-events.controller.js';
import {
  GuestPublicEntryController,
  GuestPublicEntryService
} from './guest/guest-public-entry.controller.js';
import { AdminSessionController } from './identity/admin-session.controller.js';
import { AdminSessionService } from './identity/admin-session.service.js';
import type { PlatformConfig } from './platform/config/config.js';
@Module({})
export class AppModule {
  static configure(config:PlatformConfig):DynamicModule {
    return {
      module:AppModule,
      controllers:[
        HealthController,
        OrganizerSessionController,
        AdminSessionController,
        BetaAccessRequestController,
        OrganizerAccountController,
        OrganizerEventsController,
        GuestPublicEntryController
      ],
      providers:[
        {provide:ORGANIZER_SESSION_CONFIG,useValue:config},
        {provide:DatabaseService,useFactory:() => new DatabaseService(config)},
        OrganizerSessionService,
        AdminSessionService,
        PublicBetaAccessRequestAdapterService,
        OrganizerAccountService,
        OrganizerEventsService,
        GuestPublicEntryService
      ]
    };
  }
}
