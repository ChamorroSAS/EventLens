import { randomUUID } from 'node:crypto';
import type {
  EmailSender,
  SendEmailRequest,
  SendEmailResponse
} from './contracts.js';

export interface FakeEmailSenderOptions {
  failuresRemaining?: number;
  failureError?: Error;
  permanentFailure?: boolean;
}

/**
 * Fake in-memory EmailSender port implementation for testing and development laboratory (EL-TK-157).
 */
export class FakeEmailSender implements EmailSender {
  private sent: Array<SendEmailRequest & { providerMessageId: string; sentAt: Date }> = [];
  private failuresRemaining = 0;
  private failureError: Error = new Error('PROVIDER_TIMEOUT: Mail server unavailable');
  private permanentFailure = false;

  constructor(options?: FakeEmailSenderOptions) {
    if (options) {
      this.failuresRemaining = options.failuresRemaining ?? 0;
      this.failureError = options.failureError ?? this.failureError;
      this.permanentFailure = options.permanentFailure ?? false;
    }
  }

  public setFailures(count: number, error?: Error): void {
    this.failuresRemaining = count;
    if (error) this.failureError = error;
  }

  public setPermanentFailure(permanent: boolean, error?: Error): void {
    this.permanentFailure = permanent;
    if (error) this.failureError = error;
  }

  public async send(request: SendEmailRequest): Promise<SendEmailResponse> {
    if (this.permanentFailure) {
      throw this.failureError;
    }

    if (this.failuresRemaining > 0) {
      this.failuresRemaining--;
      throw this.failureError;
    }

    const providerMessageId = 'fake-msg-' + randomUUID();
    const acceptedAt = new Date();

    this.sent.push({
      ...request,
      providerMessageId,
      sentAt: acceptedAt
    });

    return {
      providerMessageId,
      acceptedAt
    };
  }

  public getSentEmails(): ReadonlyArray<
    SendEmailRequest & { providerMessageId: string; sentAt: Date }
  > {
    return [...this.sent];
  }

  public clear(): void {
    this.sent = [];
    this.failuresRemaining = 0;
    this.permanentFailure = false;
  }
}
