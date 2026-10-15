import { Injectable, Inject, HttpException } from '@nestjs/common';
import { S3Client, GetBucketVersioningCommand, GetObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { createHash } from 'node:crypto';
import { LocalUploadTransferService, EventManagementError, type LocalUploadFile, type LocalUploadGrant, type LocalUploadSeal } from '@eventlens/event-management';
import { CapacityPlanService, CapacityReservationService } from '@eventlens/capacity-management';
import { DatabaseService } from '../platform/database/database.service.js';
import { ORGANIZER_SESSION_CONFIG } from '../identity/organizer-session.service.js';
import type { PlatformConfig } from '../platform/config/config.js';
export interface PresignInputFile extends LocalUploadFile {
}
export interface PresignedUpload {
    attemptId: string;
    uploadUrl: string;
    fields: Record<string, string>;
    expiresAt: string;
}
export interface ConfirmUploadResult {
    status: 'RECEIVED';
    state: 'CONFIRMING';
    attemptId: string;
    receivedAt: string;
}
const PHOTOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const VIDEOS = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class LocalMediaStorage {
    readonly client: S3Client;
    private activeSeals = 0;
    constructor(private readonly config: NonNullable<PlatformConfig['localMedia']>) {
        this.client = new S3Client({ region: 'us-east-1', endpoint: config.endpoint, forcePathStyle: true, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
    }
    async requireVersioning() {
        const state = await this.client.send(new GetBucketVersioningCommand({ Bucket: this.config.bucket }), { abortSignal: AbortSignal.timeout(30000) });
        if (state.Status !== 'Enabled')
            throw new HttpException({ code: 'STORAGE_UNAVAILABLE' }, 503);
    }
    async presign(grant: LocalUploadGrant): Promise<PresignedUpload> {
        await this.requireVersioning();
        const expires = Math.floor((grant.expiresAt.getTime() - Date.now()) / 1000);
        if (expires <= 0)
            throw new EventManagementError('UPLOAD_ATTEMPT_EXPIRED');
        const signed = await createPresignedPost(this.client, { Bucket: this.config.bucket, Key: grant.objectKey, Expires: expires, Fields: { 'Content-Type': grant.mimeType }, Conditions: [['content-length-range', grant.size, grant.size], ['eq', '$Content-Type', grant.mimeType]] });
        return { attemptId: grant.attemptId, uploadUrl: `/storage/${this.config.bucket}`, fields: signed.fields, expiresAt: grant.expiresAt.toISOString() };
    }
    async seal(grant: LocalUploadGrant): Promise<LocalUploadSeal> {
        if (this.activeSeals >= 2)
            throw new HttpException({ code: 'UPLOAD_STORAGE_BUSY' }, 429);
        this.activeSeals++;
        try {
            return await this.performSeal(grant);
        }
        finally {
            this.activeSeals--;
        }
    }
    private async performSeal(grant: LocalUploadGrant): Promise<LocalUploadSeal> {
        await this.requireVersioning();
        const object = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: grant.objectKey }), { abortSignal: AbortSignal.timeout(30000) });
        if (!object.VersionId || object.VersionId === 'null' || !object.Body) {
            (object.Body as { destroy?: () => void } | undefined)?.destroy?.();
            throw new EventManagementError('OBJECT_NOT_FOUND');
        }
        if (object.ContentLength !== grant.size || object.ContentType !== grant.mimeType) {
            (object.Body as {
                destroy?: () => void;
            }).destroy?.();
            throw new EventManagementError('SIZE_MISMATCH');
        }
        const hash = createHash('sha256');
        let bytes = 0;
        const deadline = setTimeout(() => (object.Body as {
            destroy?: (error?: Error) => void;
        }).destroy?.(new Error('UPLOAD_READ_TIMEOUT')), 30000);
        try {
            for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
                bytes += chunk.byteLength;
                if (bytes > grant.size)
                    throw new EventManagementError('SIZE_MISMATCH');
                hash.update(chunk);
            }
        }
        finally {
            clearTimeout(deadline);
            (object.Body as {
                destroy?: () => void;
            }).destroy?.();
        }
        const sha256 = hash.digest('hex');
        if (bytes !== grant.size || (grant.sha256 && grant.sha256 !== sha256))
            throw new EventManagementError('CORRUPTED_OR_UNREADABLE_FILE');
        const sourceVersion = object.VersionId;
        const sealedKey = `originals/${grant.attemptId}/${createHash('sha256').update(sourceVersion).digest('hex')}`;
        const copied = await this.client.send(new CopyObjectCommand({ Bucket: this.config.bucket, Key: sealedKey, CopySource: `${encodeURIComponent(this.config.bucket)}/${grant.objectKey.split('/').map(encodeURIComponent).join('/')}?versionId=${encodeURIComponent(sourceVersion)}`, MetadataDirective: 'COPY' }), { abortSignal: AbortSignal.timeout(30000) });
        if (!copied.VersionId || copied.VersionId === 'null')
            throw new HttpException({ code: 'STORAGE_UNAVAILABLE' }, 503);
        return { sourceVersion, sealedKey, sealedVersion: copied.VersionId, sha256, bytes };
    }
}
@Injectable()
export class PresignUploadService {
    private readonly domain: LocalUploadTransferService;
    private readonly storage?: LocalMediaStorage;
    constructor(
    @Inject(DatabaseService)
    database: DatabaseService,
    @Inject(ORGANIZER_SESSION_CONFIG)
    private readonly config: PlatformConfig) {
        this.domain = new LocalUploadTransferService(database.transactions, runner => {
            const capacity = new CapacityReservationService(runner, new CapacityPlanService(runner));
            return { reserveCapacity: command => capacity.reserveCapacity(command), releaseReservation: async (command) => { await capacity.releaseReservation(command); }, commitReservation: async (command) => { await capacity.commitReservation(command); }, assertActiveReservation: (eventId, reservationId) => capacity.assertActiveReservation(eventId, reservationId) };
        });
        if (config.localMedia)
            this.storage = new LocalMediaStorage(config.localMedia);
    }
    private async run<T>(token: string | undefined, origin: string | undefined, work: (storage: LocalMediaStorage) => Promise<T>): Promise<T> {
        if (!origin || ![this.config.webOrigin, new URL(this.config.publicEntryBaseUrl).origin].includes(origin))
            throw new HttpException({ code: 'FORBIDDEN' }, 403);
        if (!token)
            throw new HttpException({ code: 'GUEST_SESSION_INVALID' }, 401);
        if (!this.storage)
            throw new HttpException({ code: 'UPLOAD_STORAGE_DISABLED' }, 503);
        try {
            return await work(this.storage);
        }
        catch (error) {
            if (error instanceof HttpException)
                throw error;
            if (error instanceof EventManagementError) {
                const code = error.code;
                const status = ['UNAUTHORIZED', 'SESSION_EXPIRED', 'SESSION_REVOKED'].includes(code) ? 401 : code === 'UPLOAD_ATTEMPT_NOT_FOUND' ? 404 : code === 'IDEMPOTENCY_CONFLICT' ? 409 : ['UPLOADS_DISABLED', 'EVENT_NOT_FOUND'].includes(code) ? 403 : 422;
                throw new HttpException({ code, message: 'Upload could not be completed under the current policy.' }, status);
            }
            if ((error as {
                name?: string;
            })?.name === 'NoSuchKey')
                throw new HttpException({ code: 'OBJECT_NOT_FOUND' }, 422);
            throw new HttpException({ code: 'STORAGE_UNAVAILABLE' }, 503);
        }
    }
    async getPresignedUploadUrls(token: string | undefined, origin: string | undefined, body: unknown): Promise<PresignedUpload[]> {
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'files'))
            throw new HttpException({ code: 'INVALID_ARGUMENT' }, 400);
        const files = (body as {
            files?: unknown;
        }).files;
        if (!Array.isArray(files) || files.length < 1 || files.length > 10)
            throw new HttpException({ code: 'INVALID_ARGUMENT' }, 400);
        for (const file of files) {
            if (!file || typeof file !== 'object' || Array.isArray(file) || Object.keys(file).some(key => !['name', 'size', 'type', 'idempotencyKey', 'sha256'].includes(key)) || typeof file.name !== 'string' || file.name.length < 1 || file.name.length > 255 || !Number.isSafeInteger(file.size) || file.size < 1 || (!PHOTOS.has(file.type) && !VIDEOS.has(file.type)) || typeof file.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(file.idempotencyKey) || (file.sha256 !== undefined && (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256))))
                throw new HttpException({ code: 'INVALID_ARGUMENT' }, 400);
            if (file.size > (PHOTOS.has(file.type) ? 25 : 500) * 1024 * 1024)
                throw new HttpException({ code: 'FILE_SIZE_EXCEEDS_LIMIT' }, 422);
        }
        if (new Set(files.map(file => file.idempotencyKey)).size !== files.length)
            throw new HttpException({ code: 'IDEMPOTENCY_CONFLICT' }, 409);
        return this.run(token, origin, async (storage) => { const result: PresignedUpload[] = []; for (const file of files)
            result.push(await storage.presign(await this.domain.authorize(token!, file))); return result; });
    }
    async confirmUpload(token: string | undefined, origin: string | undefined, body: unknown): Promise<ConfirmUploadResult> {
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'attemptId') || typeof (body as {
            attemptId?: unknown;
        }).attemptId !== 'string' || !UUID.test((body as {
            attemptId: string;
        }).attemptId))
            throw new HttpException({ code: 'INVALID_ARGUMENT' }, 400);
        const attemptId = (body as {
            attemptId: string;
        }).attemptId;
        return this.run(token, origin, async (storage) => { const inspected = await this.domain.inspect(token!, attemptId); const receivedAt = inspected.receivedAt ?? await this.domain.receive(token!, inspected.grant, await storage.seal(inspected.grant)); return { status: 'RECEIVED', state: 'CONFIRMING', attemptId, receivedAt: receivedAt.toISOString() }; });
    }
}
