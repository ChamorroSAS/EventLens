import { Module, type DynamicModule } from '@nestjs/common';
import type { TransactionRunner } from '@eventlens/database';
import {
  EventDraftService,
  type EventAuditSink
} from '@eventlens/event-management';
import {
  OrganizerAuthenticationService,
  PostgresRecoveryAuthority,
  type AuditSink,
  type RecoveryAuthorityPort
} from '@eventlens/identity';
import { HealthController } from './platform/health/health.controller.js';
import { DatabaseService } from './platform/database/database.service.js';
import { EventsController } from './modules/event-management/events.controller.js';
import { PostgresEventAuditSink } from './modules/event-management/event-audit.sink.js';
import { OrganizerSessionGuard } from './platform/auth/organizer-session.guard.js';
import { PostgresAdminAuditSink } from './platform/audit/admin-audit.sink.js';
import {
  EVENT_AUDIT_SINK,
  IDENTITY_AUDIT_SINK,
  RECOVERY_AUTHORITY,
  TRANSACTION_RUNNER
} from './platform/tokens.js';
import type { PlatformConfig } from './platform/config/config.js';

@Module({})
export class AppModule {
  static configure(config:PlatformConfig):DynamicModule {
    return {
      module:AppModule,
      controllers:[HealthController,EventsController],
      providers:[
        {provide:DatabaseService,useFactory:() => new DatabaseService(config)},
        {provide:TRANSACTION_RUNNER,useFactory:(database:DatabaseService) => database.transactions,inject:[DatabaseService]},
        {provide:RECOVERY_AUTHORITY,useFactory:(runner:TransactionRunner) => new PostgresRecoveryAuthority(runner),inject:[TRANSACTION_RUNNER]},
        {provide:IDENTITY_AUDIT_SINK,useFactory:(runner:TransactionRunner) => new PostgresAdminAuditSink(runner),inject:[TRANSACTION_RUNNER]},
        {
          provide:OrganizerAuthenticationService,
          useFactory:(runner:TransactionRunner,audit:AuditSink,recovery:RecoveryAuthorityPort) => new OrganizerAuthenticationService(runner,audit,recovery),
          inject:[TRANSACTION_RUNNER,IDENTITY_AUDIT_SINK,RECOVERY_AUTHORITY]
        },
        {provide:EVENT_AUDIT_SINK,useFactory:(runner:TransactionRunner) => new PostgresEventAuditSink(runner),inject:[TRANSACTION_RUNNER]},
        {provide:EventDraftService,useFactory:(runner:TransactionRunner,audit:EventAuditSink) => new EventDraftService(runner,audit),inject:[TRANSACTION_RUNNER,EVENT_AUDIT_SINK]},
        OrganizerSessionGuard
      ]
    };
  }
}
