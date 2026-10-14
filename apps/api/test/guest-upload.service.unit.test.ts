import { expect, it, vi, beforeEach, describe } from 'vitest';
import { PresignUploadService } from '../src/guest/guest-upload.service.js';

// Mock the AWS SDK modules
vi.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(function(this: any, args: any) { this.input = args; }),
}));

import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { HeadObjectCommand } from '@aws-sdk/client-s3';

describe('PresignUploadService', () => {
  let mockS3Send: ReturnType<typeof vi.fn>;
  let mockS3Client: { send: ReturnType<typeof vi.fn> };
  let service: PresignUploadService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockS3Send = vi.fn();
    mockS3Client = { send: mockS3Send };
    
    // Create service with mocked S3 client
    service = new PresignUploadService(mockS3Client as any);
  });

  it('returns presigned POST URL with correct key pattern and fields', async () => {
    const mockPresignedPost = {
      url: 'https://minio/test-bucket',
      fields: {
        'Content-Type': 'image/jpeg',
        'x-amz-checksum-sha256': 'abc123',
        key: 'events/evt-123/media/mr-abc123/photo.jpg',
        policy: 'base64policy',
        'x-amz-signature': 'signature',
        'x-amz-credential': 'credential',
        'x-amz-date': '20240101T000000Z',
        'x-amz-algorithm': 'AWS4-HMAC-SHA256',
      },
    };

    (createPresignedPost as any).mockResolvedValueOnce(mockPresignedPost);

    const result = await service.getPresignedUploadUrls({
      eventId: 'evt-123',
      files: [{ name: 'photo.jpg', size: 1024, type: 'image/jpeg', sha256: 'abc123' }],
    }, 'session-456', 1n);

    expect(result).toHaveLength(1);
    // When sha256 is provided, mediaRef is mr- + first 22 chars of sha256
    expect(result[0].mediaRef).toBe('mr-abc123');
    expect(result[0].uploadUrl).toBe(mockPresignedPost.url);
    expect(result[0].fields['Content-Type']).toBe('image/jpeg');
    expect(result[0].fields['x-amz-checksum-sha256']).toBe('abc123');
    expect(result[0].expiresAt).toBeDefined();
    
    // Verify createPresignedPost was called with correct parameters
    expect(createPresignedPost).toHaveBeenCalledWith(
      mockS3Client, // The mocked S3Client instance
      expect.objectContaining({
        Bucket: 'eventlens', // Default bucket from service
        Conditions: expect.arrayContaining([
          ['content-length-range', 0, 1024],
          ['eq', '$Content-Type', 'image/jpeg'],
          ['eq', '$x-amz-checksum-sha256', 'abc123'],
        ]),
        Fields: expect.objectContaining({
          'Content-Type': 'image/jpeg',
          'x-amz-checksum-sha256': 'abc123',
          key: 'events/evt-123/media/mr-abc123/photo.jpg',
        }),
        Expires: 900,
      })
    );
  });

  it('generates mediaRef from sha256 when provided (22 chars)', async () => {
    const mockPresignedPost = {
      url: 'https://minio/test-bucket',
      fields: {
        'Content-Type': 'image/png',
        key: 'events/evt-123/media/mr-deadbeef12345678901234/image.png',
        policy: 'base64policy',
        'x-amz-signature': 'signature',
        'x-amz-credential': 'credential',
        'x-amz-date': '20240101T000000Z',
        'x-amz-algorithm': 'AWS4-HMAC-SHA256',
      },
    };

    (createPresignedPost as any).mockResolvedValueOnce(mockPresignedPost);

    // sha256 is 32 chars, we take first 22
    const result = await service.getPresignedUploadUrls({
      eventId: 'evt-123',
      files: [{ name: 'image.png', size: 2048, type: 'image/png', sha256: 'deadbeef12345678901234567890123456789012' }],
    }, 'session-456', 1n);

    expect(result[0].mediaRef).toBe('mr-deadbeef12345678901234');
  });

  it('generates random mediaRef when sha256 not provided', async () => {
    const mockPresignedPost = {
      url: 'https://minio/test-bucket',
      fields: {
        'Content-Type': 'image/png',
        key: 'events/evt-123/media/mr-random123/image.png',
        policy: 'base64policy',
        'x-amz-signature': 'signature',
        'x-amz-credential': 'credential',
        'x-amz-date': '20240101T000000Z',
        'x-amz-algorithm': 'AWS4-HMAC-SHA256',
      },
    };

    (createPresignedPost as any).mockResolvedValueOnce(mockPresignedPost);

    const result = await service.getPresignedUploadUrls({
      eventId: 'evt-123',
      files: [{ name: 'image.png', size: 2048, type: 'image/png' }],
    }, 'session-456', 1n);

    // Generated mediaRef: mr- + timestamp base36 + 16 random chars
    expect(result[0].mediaRef).toMatch(/^mr-[a-z0-9]{10,}$/);
  });

  it('confirms upload by checking object exists', async () => {
    mockS3Send.mockResolvedValueOnce({});

    const result = await service.confirmUpload(
      'events/evt-123/media/mr-abc123/photo.jpg',
      'op-123'
    );

    expect(result).toEqual({
      status: 'RECEIVED',
      availableAt: expect.any(String),
    });
    expect(mockS3Send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: 'eventlens',
          Key: 'events/evt-123/media/mr-abc123/photo.jpg',
        },
      })
    );
    // Verify HeadObjectCommand was used with correct args
    expect(HeadObjectCommand).toHaveBeenCalledWith({
      Bucket: 'eventlens',
      Key: 'events/evt-123/media/mr-abc123/photo.jpg',
    });
  });

  it('throws when confirmUpload object not found', async () => {
    const error = new Error('Not Found');
    (error as any).$metadata = { httpStatusCode: 404 };
    mockS3Send.mockRejectedValueOnce(error);

    await expect(service.confirmUpload('events/evt-123/media/mr-abc123/missing.jpg', 'op-123'))
      .rejects.toThrow();
  });
});