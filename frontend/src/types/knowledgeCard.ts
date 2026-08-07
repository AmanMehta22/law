export type ConceptType = 'definition' | 'timeline' | 'jurisdiction' | 'procedure' | 'penalty';
export type ReviewStatus = 'reviewed' | 'approved' | 'draft';

export interface BaseCardContent {
  summary: string;
  key_points: string[];
}

export interface DefinitionContent extends BaseCardContent {
  defined_term: string;
  applies_to: string[];
  exclusions: string[];
}

export interface TimelineContent extends BaseCardContent {
  time_limit: string;
  trigger_event: string;
  exceptions: string[];
}

export interface JurisdictionContent extends BaseCardContent {
  forum_name: string;
  pecuniary_limit: string;
  appellate_authority: string;
}

export interface ProcedureStep {
  step_number: number;
  title: string;
  description: string;
}

export interface ProcedureContent extends BaseCardContent {
  steps: ProcedureStep[];
  required_documents: string[];
  responsible_authority: string;
  fee_structure?: string;
}

export interface PenaltyContent extends BaseCardContent {
  offence: string;
  imprisonment_term?: string;
  fine_amount?: string;
  liability_notes?: string;
}

export type CardContentUnion =
  | DefinitionContent
  | TimelineContent
  | JurisdictionContent
  | ProcedureContent
  | PenaltyContent;

export interface V2KnowledgeCard {
  concept_id: string; // e.g. "definition.consumer"
  concept_type: ConceptType;
  title: string;
  description: string;
  content: CardContentUnion;
  derived_from: string[]; // V1 statute node IDs e.g. ["CPA2019-CH1-S2-7"]
  related_concepts: string[];
  search: {
    keywords: string[];
  };
  metadata: {
    review_status: ReviewStatus;
    confidence: number; // 0.0 to 1.0
    last_verified_by?: string;
    last_updated: string;
  };
}
