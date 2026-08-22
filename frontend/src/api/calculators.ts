import { apiClient, ApiEnvelope } from './client';

export interface LimitationResult {
  causeOfActionDate: string;
  limitationPeriodYears: number;
  deadline: string;
  daysRemaining: number;
  expired: boolean;
  section: string;
  explanation: string;
}

export interface JurisdictionResult {
  claimValue: number;
  forum: 'District Commission' | 'State Commission' | 'National Commission';
  section: string;
  valueRange: string;
  explanation: string;
  /**
   * The proviso to s.34(1) / s.47(1)(a)(i) / s.58(1)(a)(i): the Central
   * Government may prescribe a different value. Optional only so an older
   * backend build does not break the page; when present it must be shown,
   * because the figures above are the enacted ones and a prescribed value
   * displaces them.
   */
  prescribedValueNote?: string;
}

export async function calculateLimitation(
  causeOfActionDate: string,
): Promise<LimitationResult> {
  const response = await apiClient.post<ApiEnvelope<LimitationResult>>(
    '/calculators/limitation',
    { causeOfActionDate },
  );
  return response.data.data;
}

export async function calculateJurisdiction(
  claimValue: number,
): Promise<JurisdictionResult> {
  const response = await apiClient.post<ApiEnvelope<JurisdictionResult>>(
    '/calculators/jurisdiction',
    { claimValue },
  );
  return response.data.data;
}