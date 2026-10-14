import type { Server } from 'node:http';

export interface SpaStaticServerOptions {
  distDir?: string;
  baseHref?: string;
  onLog?: (line: string) => void;
}

export interface SpaRequestClassification {
  action: 'NOT_FOUND_404' | 'REJECT_API_OR_MEDIA_404' | 'STATIC_FILE_ONLY' | 'SERVE_SPA_INDEX';
  relativePath: string;
  redactedPath: string;
}

export function normalizeSpaBaseHref(baseHref?: string): string;
export function redactSpaLogLine(input: unknown): string;
export function classifySpaRequestPath(rawUrlOrPath?: string, baseHref?: string): SpaRequestClassification;
export function createSpaStaticServer(options?: SpaStaticServerOptions): Server;
