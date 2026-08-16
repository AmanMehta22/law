import { apiClient, ApiEnvelope } from './client';

export interface IntakeField {
  id: string;
  label: string;
  priority: number;
  required: boolean;
  question: string;
  description?: string;
}

export async function getIntakeRequirements(): Promise<IntakeField[]> {
  const response = await apiClient.get<ApiEnvelope<IntakeField[]>>(
    '/intake/requirements',
  );
  return response.data.data;
}