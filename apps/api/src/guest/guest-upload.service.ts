import { Injectable, Optional, Inject } from '@nestjs/common';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { randomUUID } from 'node:crypto';

export const S3_CLIENT_TOKEN = 'S3_CLIENT_TOKEN';

export interface PresignInputFile {
  name: string;
  size: number;
  type: string;
  sha256?: string;
}

export interface PresignedUpload {
  mediaRef: string;
  uploadUrl: string;
  fields: Record<string, string>;
  expiresAt: string; // ISO
}

export interface PresignInput {
  eventId: string;
  files: PresignInputFile[];
}

export interface ConfirmUploadResult {
  status: 'RECEIVED';
  availableAt: string;
}

@Injectable()
export class PresignUploadService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(@Optional() @Inject(S3_CLIENT_TOKEN) s3Client?: S3Client) {
    this.s3 = s3Client ?? new S3Client({
      region: 'us-east-1',
      endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
      credentials: {
        accessKeyId: process.env.MINIO_ROOT_USER || 'eventlens-local',
        secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'eventlens-local-storage-only',
      },
      forcePathStyle: true,
    });
    this.bucket = process.env.MINIO_BUCKET || 'eventlens';
  }

  private buildObjectKey(eventId: string, mediaRef: string, fileName: string): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    return `events/${eventId}/media/${mediaRef}/${safeName}`;
  }

  private generateMediaRef(): string {
    // ULID-like: 26 chars, but we'll use a short random prefix + timestamp for sortability
    const ts = Date.now().toString(36);
    const rand = randomUUID().replace(/-/g, '').slice(0, 16);
    return `mr-${ts}${rand}`;
  }

  async getPresignedUploadUrls(
    input: PresignInput,
    sessionId: string,
    credentialGeneration: bigint
  ): Promise<PresignedUpload[]> {
    // TODO: validate session + canUpload via existing service (later task)
    const expiresIn = 900; // 15 min
    const results: PresignedUpload[] = [];

    for (const file of input.files) {
      const mediaRef = file.sha256 ? `mr-${file.sha256.slice(0, 22)}` : this.generateMediaRef();
      const key = this.buildObjectKey(input.eventId, mediaRef, file.name);

      const conditions: any[] = [
        ['content-length-range', 0, file.size],
        ['eq', '$Content-Type', file.type],
      ];

      const fields: Record<string, string> = {
        'Content-Type': file.type,
        key,
      };

      if (file.sha256) {
        conditions.push(['eq', '$x-amz-checksum-sha256', file.sha256]);
        fields['x-amz-checksum-sha256'] = file.sha256;
      }

      const { url, fields: presignedFields } = await createPresignedPost(this.s3, {
        Bucket: this.bucket,
        Key: key,
        Conditions: conditions,
        Fields: fields,
        Expires: expiresIn,
      });

      results.push({
        mediaRef,
        uploadUrl: url,
        fields: presignedFields,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      });
    }
    return results;
  }

  async confirmUpload(objectKey: string, operationId: string): Promise<ConfirmUploadResult> {
    // Verify object exists in MinIO
    await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    // TODO: call MediaAcceptance.confirm with operationId (later task)
    return { status: 'RECEIVED', availableAt: new Date().toISOString() };
  }
}