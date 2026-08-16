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