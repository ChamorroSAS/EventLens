import { Injectable, Inject, Optional } from '@angular/core';
import { createEventLensClient, type EventLensClient } from '@eventlens/api-client';
import { UploadService } from './upload.service.js';
import type { UploadLocalFile } from './upload.types.js';

export type OrchestratorCallbacks = {
  onProgress: (fileId: string, progress: number) => void;
  onStatusChange: (
    fileId: string,
    status: UploadLocalFile['status'],
    options?: { error?: string; canRetry?: boolean; attemptId?: string }
  ) => void;
};

interface PresignedUpload {
  mediaRef: string;
  uploadUrl: string;
  fields: Record<string, string>;
  expiresAt: string;
}

interface PresignResponse {
  uploads: PresignedUpload[];
}

interface ConfirmResponse {
  status: 'RECEIVED';
  availableAt: string;
}

const ORCHESTRATOR_CLIENT_TOKEN = 'ORCHESTRATOR_CLIENT_TOKEN';

@Injectable({ providedIn: 'root' })
export class UploadOrchestratorService {
  private readonly client: EventLensClient;
  private activeUploads = new Map<string, AbortController>();

  constructor(
    private readonly uploadService: UploadService,
    @Optional() @Inject(ORCHESTRATOR_CLIENT_TOKEN) client?: EventLensClient
  ) {
    this.client = client ?? createEventLensClient();
  }

  static provideClient(client: EventLensClient) {
    return { provide: ORCHESTRATOR_CLIENT_TOKEN, useValue: client };
  }

  async startUpload(file: UploadLocalFile, callbacks: OrchestratorCallbacks): Promise<void> {
    const controller = new AbortController();
    this.activeUploads.set(file.id, controller);

    try {
      // 1. HASHING
      callbacks.onStatusChange(file.id, 'HASHING');
      const sha256 = await this.uploadService.calculateSha256(file.file);
      file.sha256 = sha256;

      // 2. AUTHORIZING (get presigned URL)
      callbacks.onStatusChange(file.id, 'AUTHORIZING');
      const { data, response } = await this.client.POST(
        '/api/v1/public/guest-session/uploads/presign' as any,
        {
          signal: controller.signal,
          body: { files: [{ name: file.name, size: file.size, type: file.type, sha256 }] },
        }
      );
      if (!response.ok || !data?.uploads?.[0]) {
        throw new Error('Presign failed');
      }
      const presigned = data.uploads[0];
      file.mediaRef = presigned.mediaRef;
      file.objectKey = presigned.fields.key;

      // 3. UPLOADING (multipart POST to MinIO presigned URL)
      callbacks.onStatusChange(file.id, 'UPLOADING');
      await this.uploadToMinio(presigned, file, (progress) => callbacks.onProgress(file.id, progress), controller.signal);

      // 4. CONFIRMING
      callbacks.onStatusChange(file.id, 'CONFIRMING');
      const operationId = crypto.randomUUID();
      const { data: confirmData, response: confirmResp } = await this.client.POST(
        '/api/v1/public/guest-session/uploads/confirm' as any,
        { signal: controller.signal, body: { mediaRef: file.mediaRef, objectKey: file.objectKey, operationId } }
      );
      if (!confirmResp.ok || !confirmData) {
        throw new Error('Confirm failed');
      }

      // 5. RECEIVED
      callbacks.onStatusChange(file.id, 'RECEIVED', { attemptId: operationId });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const canRetry = !(err instanceof TypeError) && !errorMessage.includes('401');
      callbacks.onStatusChange(file.id, 'REJECTED', { error: errorMessage, canRetry });
    } finally {
      this.activeUploads.delete(file.id);
    }
  }

  async retryUpload(fileId: string, file: UploadLocalFile, callbacks: OrchestratorCallbacks): Promise<void> {
    await this.startUpload(file, callbacks);
  }

  private async uploadToMinio(
    presigned: { uploadUrl: string; fields: Record<string, string> },
    file: UploadLocalFile,
    onProgress: (pct: number) => void,
    signal: AbortSignal
  ): Promise<void> {
    // Build multipart form data for presigned POST
    const formData = new FormData();
    Object.entries(presigned.fields).forEach(([k, v]) => formData.append(k, v));
    formData.append('file', file.file);

    // Use fetch with stream for progress (simplified: no real stream progress in browsers yet)
    // For real progress, use XMLHttpRequest or a library; here we simulate
    onProgress(10);
    const response = await fetch(presigned.uploadUrl, {
      method: 'POST',
      body: formData,
      signal,
    });
    onProgress(90);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MinIO upload failed: ${response.status} ${text}`);
    }
    onProgress(100);
  }

  abortAll(): void {
    for (const ctrl of this.activeUploads.values()) {
      ctrl.abort();
    }
    this.activeUploads.clear();
  }
}