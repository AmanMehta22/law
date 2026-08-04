export type NodeType = 'act' | 'chapter' | 'section' | 'subsection' | 'clause';
export type ContentType = 'statute' | 'definition' | 'procedure' | 'penalty';

export interface Citation {
  source_act: string;
  section: string;
  title: string;
}

export interface DocumentRef {
  title: string;
  file_type?: string;
  url?: string;
}

export interface V1StatuteNode {
  id: string; // e.g. "CPA2019-CH1-S2-7"
  parent_id: string | null;
  path: string;
  order: number;
  node_type: NodeType;
  content_type: ContentType;
  act_id: string; // "CPA2019"
  chapter_number: number;
  section_number: number;
  subsection_number?: number | string;
  official_text: string;
  citations: Citation[];
  relationships: {
    type: string;
    target_id: string;
  }[];
  document: DocumentRef;
  metadata: {
    token_count: number;
    checksum: string;
    last_updated: string;
  };
}
