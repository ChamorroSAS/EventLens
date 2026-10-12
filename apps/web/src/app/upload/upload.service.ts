import { Injectable } from '@angular/core';
import type { UploadLocalFile, UploadItemStatus, UploadBatchSummary } from './upload.types.js';

export interface FileValidationResult {
  valid: boolean;
  reason?: string;
}

const SUPPORTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'video/webm'
];

const MAX_PHOTO_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500MB

@Injectable({
  providedIn: 'root'
})
export class UploadService {
  /**
   * Valida un archivo localmente antes de enviarlo.
   * La validación local es una ayuda de UX; el backend conserva la autoridad final.
   */
  public validateLocalFile(file: { name: string; size: number; type: string }): FileValidationResult {
    if (!file) {
      return { valid: false, reason: 'Archivo nulo o inválido' };
    }

    const type = file.type?.toLowerCase() || '';
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    const isImage = type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(extension);
    const isVideo = type.startsWith('video/') || ['mp4', 'mov', 'webm'].includes(extension);

    if (!isImage && !isVideo) {
      return {
        valid: false,
        reason: 'Formato no soportado. Se aceptan fotos (JPEG, PNG, WebP, HEIC) y videos (MP4, MOV, WebM).'
      };
    }

    if (isImage && file.size > MAX_PHOTO_BYTES) {
      return {
        valid: false,
        reason: 'La foto supera el límite máximo de 50 MB.'
      };
    }

    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      return {
        valid: false,
        reason: 'El video supera el límite máximo de 500 MB.'
      };
    }

    return { valid: true };
  }

  /**
   * Calcula el resumen agregado del lote de archivos.
   */
  public calculateBatchSummary(files: UploadLocalFile[]): UploadBatchSummary {
    const totalFiles = files.length;
    if (totalFiles === 0) {
      return {
        totalFiles: 0,
        receivedCount: 0,
        inProgressCount: 0,
        actionRequiredCount: 0,
        rejectedCount: 0,
        cancelledCount: 0,
        overallProgress: 0,
        allCompleted: false
      };
    }

    let receivedCount = 0;
    let inProgressCount = 0;
    let actionRequiredCount = 0;
    let rejectedCount = 0;
    let cancelledCount = 0;
    let totalProgressSum = 0;

    for (const f of files) {
      if (f.status === 'RECEIVED') {
        receivedCount++;
        totalProgressSum += 100;
      } else if (f.status === 'REJECTED') {
        rejectedCount++;
        if (f.canRetry) {
          actionRequiredCount++;
        }
        totalProgressSum += 100;
      } else if (f.status === 'CANCELLED_POLICY') {
        cancelledCount++;
        totalProgressSum += 100;
      } else {
        inProgressCount++;
        totalProgressSum += f.progress;
      }
    }

    const overallProgress = Math.round(totalProgressSum / totalFiles);
    const allCompleted = inProgressCount === 0 && totalFiles > 0;

    return {
      totalFiles,
      receivedCount,
      inProgressCount,
      actionRequiredCount,
      rejectedCount,
      cancelledCount,
      overallProgress,
      allCompleted
    };
  }

  /**
   * Reconcilia las políticas de evento: cancela transferencias no confirmadas
   * y preserva estrictamente las ya recibidas/aceptadas (DEC-085).
   */
  public applyPolicyCancellation(
    files: UploadLocalFile[],
    reason = 'EVENT_CLOSED'
  ): UploadLocalFile[] {
    return files.map((file) => {
      // Invariante DEC-085: Si ya está en RECEIVED, NUNCA se cancela.
      if (file.status === 'RECEIVED') {
        return file;
      }

      // Los archivos en cola, autorizando, subiendo, confirmando o validando se cancelan.
      if (['QUEUED', 'AUTHORIZING', 'UPLOADING', 'CONFIRMING', 'VALIDATING'].includes(file.status)) {
        return {
          ...file,
          status: 'CANCELLED_POLICY' as UploadItemStatus,
          canRetry: false,
          error: `Cancelado por política del evento: ${reason}`,
          rejectionReason: reason
        };
      }

      return file;
    });
  }
}
