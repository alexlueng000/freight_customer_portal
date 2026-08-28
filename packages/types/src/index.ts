export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthResponse {
  status: HealthStatus;
  service: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
}
