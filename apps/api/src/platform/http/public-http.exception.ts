import { HttpException } from '@nestjs/common';

/**
 * Trusted HTTP error boundary that exposes an explicit, allowlisted public code and Spanish
 * message. Unlike a raw HttpException payload, these values are safe to serialize to clients.
 */
export class PublicHttpException extends HttpException {
  constructor(
    status: number,
    public readonly publicCode: string,
    public readonly publicMessage: string
  ) {
    super({ code: publicCode, message: publicMessage }, status);
  }
}
