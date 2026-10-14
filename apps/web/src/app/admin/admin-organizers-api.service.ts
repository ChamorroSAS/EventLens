import { Injectable } from '@angular/core';
import { createEventLensClient, type operations } from '@eventlens/api-client';
import { AdminSessionService } from './admin-session.service.js';

export type OrganizerSummary = operations['getAdminOrganizer']['responses'][200]['content']['application/json'];
export type OrganizerPage = operations['listAdminOrganizers']['responses'][200]['content']['application/json'];
export type OrganizerMutation = operations['createAdminOrganizer']['responses'][201]['content']['application/json'];

/** Server error codes mapped to distinct, actionable messages (EL-TK-242). */
const BY_CODE: Record<string, string> = {
  EMAIL_EXISTS: 'Ya existe una cuenta con ese correo. Búscala en la lista o usa otro correo.',
  IDEMPOTENCY_CONFLICT: 'La operación ya estaba registrada con otros datos. Recarga la lista antes de reintentar.',
  STALE_REVISION: 'La cuenta cambió desde que abriste el formulario. Recarga la lista antes de continuar.',
  INVALID_STATE: 'La cuenta no permite esa operación en su estado actual. Recarga la lista.',
  INVALID_ARGUMENT: 'Revisa el correo, el nombre y el motivo de la operación.',
  AUTHORITY_UNAVAILABLE: 'No se confirmó la operación. Consulta la cuenta antes de reintentar; no se habilitará acceso sin confirmación.',
  FORBIDDEN: 'No se autorizó la operación. Si tu acceso ya no es reciente, cierra sesión y vuelve a ingresar.',
  NOT_FOUND: 'Esta cuenta ya no está disponible.',
  UNAUTHENTICATED: 'Tu sesión expiró. Vuelve a ingresar como administrador.'
};

/** Fallback by transport status when the server sent no recognizable code. */
const BY_STATUS: Record<number, string> = {
  400: 'Revisa el correo, el nombre y el motivo de la operación.',
  401: 'Tu sesión expiró. Vuelve a ingresar como administrador.',
  403: 'No se autorizó la operación. Si tu acceso ya no es reciente, cierra sesión y vuelve a ingresar.',
  404: 'Esta cuenta ya no está disponible.',
  409: 'La cuenta cambió o la operación ya estaba registrada. Recarga la lista antes de continuar.',
  422: 'Revisa el correo, el nombre y el motivo de la operación.',
  503: 'No se confirmó la operación. Consulta la cuenta antes de reintentar; no se habilitará acceso sin confirmación.'
};

@Injectable({ providedIn: 'root' })
export class AdminOrganizersApiService {
  private readonly client = createEventLensClient();
  private generation = 0;
  constructor(private readonly session: AdminSessionService) {
    session.registerPrivateCacheClearer(() => { this.generation++; });
  }
  private codeOf(error: unknown): string | null {
    return error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : null;
  }
  private error(status: number, code: string | null): Error {
    if (status === 401) this.session.invalidateProtectedRead(status);
    const message = (code ? BY_CODE[code] : undefined) ?? BY_STATUS[status] ?? 'No se pudo completar la operación. Intenta nuevamente.';
    return new Error(message);
  }
  private async result<T>(promise: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
    const generation = this.generation;
    let result: { data?: T; error?: unknown; response: Response };
    try { result = await promise; } catch { throw this.error(503, null); }
    if (generation !== this.generation) throw this.error(401, null);
    if (!result.response.ok || !result.data) throw this.error(result.response.status, this.codeOf(result.error));
    return result.data;
  }
  list(query: string, offset: number): Promise<OrganizerPage> {
    return this.result(this.client.GET('/api/v1/admin/organizers', { params: { query: { search: query, limit: 20, offset } } }));
  }
  private async headers() {
    let token = this.session.getCsrfToken();
    if (!token) {
      await this.session.renewSessionContext();
      token = this.session.getCsrfToken();
    }
    if (!token) throw this.error(this.session.state() === 'UNAVAILABLE' ? 503 : 401, null);
    return { 'X-CSRF-Token': token };
  }
  async create(body: { email: string; displayName?: string; reason: string; idempotencyKey: string }): Promise<OrganizerMutation> {
    return this.result(this.client.POST('/api/v1/admin/organizers', { body, headers: await this.headers() }));
  }
  async update(id: string, body: { displayName: string; reason: string; expectedRevision: string; idempotencyKey: string }): Promise<OrganizerMutation> {
    return this.result(this.client.PATCH('/api/v1/admin/organizers/{accountId}', { params: { path: { accountId: id } }, body, headers: await this.headers() }));
  }
  async action(id: string, action: 'disable' | 'enable' | 'temporary-password', body: { reason: string; expectedRevision: string; idempotencyKey: string }): Promise<OrganizerMutation> {
    const options = { params: { path: { accountId: id } }, body, headers: await this.headers() };
    if (action === 'disable') return this.result(this.client.POST('/api/v1/admin/organizers/{accountId}/disable', options));
    if (action === 'enable') return this.result(this.client.POST('/api/v1/admin/organizers/{accountId}/enable', options));
    return this.result(this.client.POST('/api/v1/admin/organizers/{accountId}/temporary-password', options));
  }
}
