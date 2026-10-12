import type { TransactionRunner, SqlTransaction } from '@eventlens/database';
import {
  CapacityError,
  CommercialCapacityUsageSummary,
  QueryCommercialCapacityCommand,
} from './contracts.js';
import { CapacityPlanService } from './capacity-plan.js';

interface RawBalanceRow {
  consumed_bytes: string | bigint;
  consumed_files: number;
}

interface RawReservationSumRow {
  active_bytes: string | bigint | null;
  active_files: number | string | null;
}

export type EventOwnershipVerifier = (eventId: string, organizerId: string) => Promise<boolean>;

export class CapacityQueryService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly planService: CapacityPlanService,
    private readonly ownershipVerifier?: EventOwnershipVerifier
  ) {
    if (!transactions) {
      throw new CapacityError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
    if (!planService) {
      throw new CapacityError('INVALID_ARGUMENT', 'CapacityPlanService is required');
    }
  }

  /**
   * Consulta el snapshot de consumo comercial, reservas y capacidad disponible de un evento (EL-TK-135).
   * Distingue cero real de error/carga, soporta situaciones de sobre-cuota sin truncar datos reales,
   * y garantiza aislamiento por actor/permisos.
   */
  public async queryCommercialCapacity(
    command: QueryCommercialCapacityCommand
  ): Promise<CommercialCapacityUsageSummary> {
    if (!command.eventId || typeof command.eventId !== 'string' || !command.eventId.trim()) {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    // Validación de permisos y aislamiento si el llamador es un organizador
    if (command.actorContext) {
      const { actorType } = command.actorContext;
      if (actorType === 'ORGANIZER_HUMAN') {
        const organizerId = (command.actorContext as { accountId?: string }).accountId;
        if (this.ownershipVerifier && organizerId) {
          const isOwner = await this.ownershipVerifier(command.eventId, organizerId);
          if (!isOwner) {
            throw new CapacityError(
              'UNAUTHORIZED',
              `Organizer '${organizerId}' is not authorized to query capacity for event '${command.eventId}'`
            );
          }
        }
      }
    }

    return this.transactions.run(async (tx) => {
      // 1. Resolver límites efectivos del plan (o sobreescrituras vigentes)
      const effectiveLimits = await this.planService.resolveEffectiveLimitsWithTx(tx, {
        eventId: command.eventId,
      });

      // 2. Consultar balance comercial acumulado (solo originales confirmados, DEC-096)
      const balanceRows = await tx.query<RawBalanceRow>(
        `SELECT consumed_bytes, consumed_files FROM event_capacity_balance WHERE event_id = $1`,
        command.eventId
      );

      const consumedBytes = balanceRows.length > 0 ? BigInt(balanceRows[0].consumed_bytes) : 0n;
      const consumedFiles = balanceRows.length > 0 ? Number(balanceRows[0].consumed_files) : 0;

      // 3. Consultar suma de reservas activas (en tránsito, no confirmadas)
      const reservationRows = await tx.query<RawReservationSumRow>(
        `SELECT COALESCE(SUM(bytes), 0) AS active_bytes, COALESCE(SUM(file_slots), 0) AS active_files
         FROM capacity_reservation
         WHERE event_id = $1 AND status = 'ACTIVE'`,
        command.eventId
      );

      const activeReservedBytes = BigInt(reservationRows[0]?.active_bytes ?? 0);
      const activeReservedFiles = Number(reservationRows[0]?.active_files ?? 0);

      // 4. Cálculos de disponibilidad y estado
      const totalCommittedAndReservedBytes = consumedBytes + activeReservedBytes;
      const totalCommittedAndReservedFiles = consumedFiles + activeReservedFiles;

      // Capacidad restante disponible (cota mínima cero si está sobre límite, sin truncar el consumo real)
      const availableBytes =
        effectiveLimits.storageBytes > totalCommittedAndReservedBytes
          ? effectiveLimits.storageBytes - totalCommittedAndReservedBytes
          : 0n;

      const availableFiles =
        effectiveLimits.maxFiles > totalCommittedAndReservedFiles
          ? effectiveLimits.maxFiles - totalCommittedAndReservedFiles
          : 0;

      // Cálculo de porcentajes decimales con precisión de dos decimales
      const storagePercent =
        effectiveLimits.storageBytes > 0n
          ? Number((totalCommittedAndReservedBytes * 10000n) / effectiveLimits.storageBytes) / 100
          : 100;

      const filesPercent =
        effectiveLimits.maxFiles > 0
          ? Math.round(((totalCommittedAndReservedFiles * 100) / effectiveLimits.maxFiles) * 100) / 100
          : 100;

      // Banderas de estado
      const isZeroUsage =
        consumedBytes === 0n &&
        consumedFiles === 0 &&
        activeReservedBytes === 0n &&
        activeReservedFiles === 0;

      const isOverStorageQuota = totalCommittedAndReservedBytes > effectiveLimits.storageBytes;
      const isOverFilesQuota = totalCommittedAndReservedFiles > effectiveLimits.maxFiles;
      const isNearStorageLimit = storagePercent >= 80;
      const isNearFilesLimit = filesPercent >= 80;

      return {
        eventId: command.eventId,
        effectiveLimits,
        consumedStorage: {
          bytes: consumedBytes,
          megabytes: this.toMegabytes(consumedBytes),
          gigabytes: this.toGigabytes(consumedBytes),
          files: consumedFiles,
        },
        activeReservations: {
          bytes: activeReservedBytes,
          megabytes: this.toMegabytes(activeReservedBytes),
          gigabytes: this.toGigabytes(activeReservedBytes),
          files: activeReservedFiles,
        },
        available: {
          bytes: availableBytes,
          megabytes: this.toMegabytes(availableBytes),
          gigabytes: this.toGigabytes(availableBytes),
          files: availableFiles,
        },
        usagePercentage: {
          storagePercent,
          filesPercent,
        },
        flags: {
          isZeroUsage,
          isOverStorageQuota,
          isOverFilesQuota,
          isNearStorageLimit,
          isNearFilesLimit,
        },
        snapshotAt: new Date(),
      };
    });
  }

  private toMegabytes(bytes: bigint): number {
    return Math.round((Number(bytes) / 1_000_000) * 100) / 100;
  }

  private toGigabytes(bytes: bigint): number {
    return Math.round((Number(bytes) / 1_000_000_000) * 100) / 100;
  }
}
