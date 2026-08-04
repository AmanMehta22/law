export interface RequiredField {
  id: string;

  label: string;

  priority: number;

  required: boolean;

  question: string;

  description?: string;
}
export interface LegalDomain {
  id: string;

  name: string;

  description: string;

  requiredFields: RequiredField[];
}
