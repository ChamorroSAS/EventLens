import { Injectable } from '@angular/core';
import type { operations } from '@eventlens/api-client';
import type { UploadLocalFile } from './upload.types.js';
type PresignInput = operations['presignGuestUploads']['requestBody']['content']['application/json'];
type PresignResult = operations['presignGuestUploads']['responses'][200]['content']['application/json'];
type ConfirmInput = operations['confirmGuestUpload']['requestBody']['content']['application/json'];
type ConfirmResult = operations['confirmGuestUpload']['responses'][200]['content']['application/json'];

export type OrchestratorCallbacks = {
  onProgress: (fileId: string, progress: number) => void;
  onStatusChange: (fileId: string, status: UploadLocalFile['status'], options?: { error?: string; canRetry?: boolean; attemptId?: string }) => void;
};
class TransferError extends Error {
  constructor(readonly status: number, readonly publicCode?: string) { super('UPLOAD_REQUEST_FAILED'); }
}

@Injectable({ providedIn: 'root' })
export class UploadOrchestratorService {
  private readonly activeUploads = new Map<string, AbortController>();

  async startUpload(file: UploadLocalFile, callbacks: OrchestratorCallbacks): Promise<void> {
    if (this.activeUploads.has(file.id)) return;
    const controller = new AbortController();
    this.activeUploads.set(file.id, controller);
    const status = (value: UploadLocalFile['status'], options?: { error?: string; canRetry?: boolean; attemptId?: string }) => {
      if (!controller.signal.aborted) callbacks.onStatusChange(file.id, value, options);
    };
    try {
      file.idempotencyKey ??= createUploadKey();
      if (!file.bytesTransferred) {
        if (!isContentType(file.type)) throw new TransferError(422);
        status('AUTHORIZING');
        const result = await this.request('/api/v1/public/guest-session/uploads/presign', {
          files: [{ name: file.name, size: file.size, type: file.type, idempotencyKey: file.idempotencyKey }]
        }, controller.signal);
        if (!isPresignResult(result)) throw new TransferError(503);
        const grant = result.uploads[0]!;
        file.attemptId = grant.attemptId;
        file.presigned = { uploadUrl: grant.uploadUrl, expiresAt: grant.expiresAt, fields: grant.fields };
        if (controller.signal.aborted) return;
        status('UPLOADING');
        await this.transfer(file.presigned, file.file, controller.signal, (percent) => {
          if (!controller.signal.aborted) callbacks.onProgress(file.id, percent);
        });
        file.bytesTransferred = true;
      }
      if (controller.signal.aborted) return;
      status('CONFIRMING');
      if (!file.attemptId) throw new TransferError(503);
      const receipt = await this.request('/api/v1/public/guest-session/uploads/confirm', { attemptId: file.attemptId }, controller.signal);
      if (!isConfirmResult(receipt) || receipt.attemptId !== file.attemptId) throw new TransferError(503);
      status('RECEIVED', { attemptId: file.attemptId, canRetry: false });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      const code = error instanceof TransferError ? error.status : 0;
      const publicMessage = error instanceof TransferError ? uploadErrorMessage(error.publicCode) : undefined;
      status('REJECTED', {
        error: publicMessage ?? (code === 401 ? 'Tu sesión ha expirado o fue revocada. Vuelve a abrir el enlace del evento.' :
          code === 403 || code === 409 ? 'El evento o tu sesión ya no permiten continuar esta carga. Consulta Mis aportes para conocer su estado.' :
          code === 422 ? 'El archivo no cumple las condiciones de carga del evento.' :
          file.bytesTransferred ? 'No pudimos confirmar la recepción. Reintenta para consultar el mismo intento sin enviar de nuevo el archivo.' : 'No se pudo transferir el archivo. Reintenta cuando tengas conexión.'),
        canRetry: code === 0 || code >= 500 || code === 408 || code === 429
      });
    } finally {
      if (this.activeUploads.get(file.id) === controller) this.activeUploads.delete(file.id);
    }
  }

  retryUpload(_fileId: string, file: UploadLocalFile, callbacks: OrchestratorCallbacks): Promise<void> {
    return this.startUpload(file, callbacks);
  }
  abort(fileIds: readonly string[]): void {
    for (const id of fileIds) this.activeUploads.get(id)?.abort();
  }
  abortAll(): void { this.abort([...this.activeUploads.keys()]); }

  private request(path: '/api/v1/public/guest-session/uploads/presign', body: PresignInput, signal: AbortSignal): Promise<unknown>;
  private request(path: '/api/v1/public/guest-session/uploads/confirm', body: ConfirmInput, signal: AbortSignal): Promise<unknown>;
  private async request(path: string, body: PresignInput | ConfirmInput, signal: AbortSignal): Promise<unknown> {
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
      let publicCode: string | undefined;
      try {
        const problem: unknown = await response.json();
        if (isRecord(problem) && typeof problem['code'] === 'string' && uploadErrorMessage(problem['code'])) publicCode = problem['code'];
      } catch { /* The HTTP status still determines whether a retry is safe. */ }
      throw new TransferError(response.status, publicCode);
    }
    return response.json();
  }
  private transfer(grant: { uploadUrl: string; fields: Record<string, string> }, file: File, signal: AbortSignal, progress: (percent: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(grant.uploadUrl, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/storage/')) { reject(new TransferError(400)); return; }
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      const cleanup = () => signal.removeEventListener('abort', abort);
      xhr.open('POST', url.href);
      xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.floor(100 * event.loaded / event.total)); };
      xhr.onload = () => { cleanup(); xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new TransferError(xhr.status)); };
      xhr.onerror = () => { cleanup(); reject(new TransferError(0)); };
      xhr.onabort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { cleanup(); reject(new DOMException('Aborted', 'AbortError')); return; }
      const form = new FormData();
      Object.entries(grant.fields).forEach(([key, value]) => form.append(key, value));
      form.append('file', file);
      xhr.send(form);
    });
  }
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object'; }
function isStringMap(value: unknown): value is Record<string, string> { return isRecord(value) && Object.values(value).every(item => typeof item === 'string'); }
function isContentType(value: string): value is PresignInput['files'][number]['type'] {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/webm', 'video/quicktime'].includes(value);
}
function isPresignResult(value: unknown): value is PresignResult {
  if (!isRecord(value) || !Array.isArray(value['uploads']) || value['uploads'].length !== 1) return false;
  const grant: unknown = value['uploads'][0];
  return isRecord(grant) && typeof grant['attemptId'] === 'string' && typeof grant['uploadUrl'] === 'string' && typeof grant['expiresAt'] === 'string' && isStringMap(grant['fields']);
}
function isConfirmResult(value: unknown): value is ConfirmResult {
  return isRecord(value) && value['status'] === 'RECEIVED' && value['state'] === 'CONFIRMING' && typeof value['attemptId'] === 'string' && typeof value['receivedAt'] === 'string';
}
function uploadErrorMessage(code?: string): string | undefined {
  switch (code) {
    case 'INSUFFICIENT_FILE_CAPACITY': return 'El evento alcanzó el límite de archivos. Contacta al organizador.';
    case 'INSUFFICIENT_STORAGE_CAPACITY': return 'El evento no tiene espacio suficiente para este archivo. Contacta al organizador.';
    case 'FILE_SIZE_EXCEEDS_LIMIT': return 'El archivo supera el tamaño permitido: fotos hasta 25 MB y vídeos hasta 500 MB.';
    case 'UPLOAD_ATTEMPT_EXPIRED': return 'El plazo de este intento de carga expiró. Vuelve a seleccionar el archivo para iniciar una nueva carga.';
    case 'UPLOADS_DISABLED': return 'El organizador deshabilitó las subidas. Consulta Mis aportes para conocer el estado de los archivos enviados.';
    case 'SIZE_MISMATCH': return 'El archivo recibido no coincide con el tamaño declarado. Vuelve a seleccionar el archivo.';
    case 'CORRUPTED_OR_UNREADABLE_FILE': return 'No pudimos leer el archivo recibido. Selecciona un archivo válido.';
    default: return undefined;
  }
}
export function createUploadKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
