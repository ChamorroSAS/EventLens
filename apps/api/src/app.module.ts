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
import { AdminReadOnlyController } from './admin/admin-read-only.controller.js';
import { AdminReadOnlyService } from './admin/admin-read-only.service.js';
import type { PlatformConfig } from './platform/config/config.js';
import { createLocalAdminAuthority } from './identity/local-admin-authority.js';
import { ADMIN_RECOVERY_AUTHORITY } from './identity/admin-session.service.js';
import { AdminOrganizersController } from './identity/admin-organizers.controller.js';
import { AdminOrganizersService } from './identity/admin-organizers.service.js';
import { PresignUploadService } from './guest/guest-upload.service.js';
@Module({})
export class AppModule {
  static configure(config:PlatformConfig):DynamicModule {
    return {
      module:AppModule,
      controllers:[
        HealthController,
        OrganizerSessionController,
        AdminSessionController,
        AdminReadOnlyController,
        AdminOrganizersController,
        BetaAccessRequestController,
        OrganizerAccountController,
        OrganizerEventsController,
        GuestPublicEntryController
      ],
      providers:[
        ...(config.localAdminAuthorityDir ? [{
          provide: ADMIN_RECOVERY_AUTHORITY,
          useFactory: () => createLocalAdminAuthority(config.localAdminAuthorityDir!)
        }] : []),
        {provide:ORGANIZER_SESSION_CONFIG,useValue:config},
        {provide:DatabaseService,useFactory:() => new DatabaseService(config)},
        OrganizerSessionService,
        AdminSessionService,
        AdminReadOnlyService,
        AdminOrganizersService,
        PublicBetaAccessRequestAdapterService,
        OrganizerAccountService,
        OrganizerEventsService,
        GuestPublicEntryService,
        PresignUploadService
      ]
    };
  }
}
