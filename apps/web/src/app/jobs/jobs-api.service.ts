import { Injectable } from '@angular/core';
import type {
  AdminJobDetail,
  AdminJobStatus,
  AdminQueryJobsResult,
  ExecuteJobActionPayload,
  ExecuteJobActionResponse
} from './jobs.types.js';

export interface QueryJobsParams {
  resourceRef?: string;
  status?: AdminJobStatus;
  page?: number;
  limit?: number;
  callerActorId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class JobsApiService {
  async queryJobs(params: QueryJobsParams = {}): Promise<AdminQueryJobsResult> {
    const query = new URLSearchParams();
    if (params.resourceRef) query.set('resourceRef', params.resourceRef);
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    const headers: Record<string, string> = {
      Accept: 'application/json'
    };
    if (params.callerActorId) {
      headers['X-Admin-Actor-Id'] = params.callerActorId;
    }

    const url = `/api/v1/admin/jobs${query.toString() ? '?' + query.toString() : ''}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('UNAUTHORIZED_ACCESS');
      }
      throw new Error(`QUERY_JOBS_FAILED: ${res.status}`);
    }

    return (await res.json()) as AdminQueryJobsResult;
  }

  async getJobDetail(jobId: string, callerActorId?: string): Promise<AdminJobDetail> {
    const headers: Record<string, string> = {
      Accept: 'application/json'
    };
    if (callerActorId) {
      headers['X-Admin-Actor-Id'] = callerActorId;
    }

    const res = await fetch(`/api/v1/admin/jobs/${encodeURIComponent(jobId)}`, { headers });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('JOB_NOT_FOUND');
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error('UNAUTHORIZED_ACCESS');
      }
      throw new Error(`GET_JOB_DETAIL_FAILED: ${res.status}`);
    }

    return (await res.json()) as AdminJobDetail;
  }

  async executeJobAction(
    jobId: string,
    payload: ExecuteJobActionPayload,
    callerActorId?: string
  ): Promise<ExecuteJobActionResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
    if (callerActorId) {
      headers['X-Admin-Actor-Id'] = callerActorId;
    }

    const res = await fetch(`/api/v1/admin/jobs/${encodeURIComponent(jobId)}/actions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const code = (errorBody as { code?: string }).code || 'ACTION_FAILED';
      const message = (errorBody as { message?: string }).message || `Status ${res.status}`;
      throw new Error(`${code}: ${message}`);
    }

    return (await res.json()) as ExecuteJobActionResponse;
  }
}
