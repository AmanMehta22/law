import { V1StatuteNode } from '../../types/statute';

export const mockStatuteNodes: V1StatuteNode[] = [
  {
    id: 'CPA2019-CH1-S2-7',
    parent_id: null,
    path: 'CPA2019/CH1/S2/7',
    order: 1,
    node_type: 'subsection',
    content_type: 'definition',
    act_id: 'CPA2019',
    chapter_number: 1,
    section_number: 2,
    subsection_number: 7,
    official_text:
      'Section 2(7): "consumer" means any person who— (i) buys any goods for a consideration which has been paid or promised or partly paid and partly promised, or under any system of deferred payment and includes any user of such goods other than the person who buys such goods for consideration paid or promised or partly paid or partly promised... but does not include a person who obtains such goods for resale or for any commercial purpose.',
    citations: [
      {
        source_act: 'The Consumer Protection Act, 2019',
        section: 'Section 2(7)',
        title: 'Definition of Consumer',
      },
    ],
    relationships: [
      {
        type: 'expanded_by',
        target_id: 'CPA2019-CH3-S34',
      },
    ],
    document: {
      title: 'Consumer Protection Act 2019 Official Gazette',
      file_type: 'pdf',
      url: 'https://consumeraffairs.nic.in/acts-and-rules/consumer-protection-act-2019',
    },
    metadata: {
      token_count: 142,
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      last_updated: '2026-01-15T00:00:00Z',
    },
  },
  {
    id: 'CPA2019-CH3-S69-1',
    parent_id: null,
    path: 'CPA2019/CH4/S69/1',
    order: 2,
    node_type: 'section',
    content_type: 'procedure',
    act_id: 'CPA2019',
    chapter_number: 4,
    section_number: 69,
    subsection_number: 1,
    official_text:
      'Section 69(1): The District Commission, the State Commission or the National Commission shall not admit a complaint unless it is filed within two years from the date on which the cause of action has arisen. Provided that a complaint may be entertained after the period specified if the complainant satisfies the Commission that he had sufficient cause for not filing the complaint within such period.',
    citations: [
      {
        source_act: 'The Consumer Protection Act, 2019',
        section: 'Section 69(1)',
        title: 'Limitation Period for Filing Complaint',
      },
    ],
    relationships: [],
    document: {
      title: 'Consumer Protection Act 2019 Section 69',
      file_type: 'pdf',
    },
    metadata: {
      token_count: 88,
      checksum: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
      last_updated: '2026-01-15T00:00:00Z',
    },
  },
  {
    id: 'CPA2019-CH3-S34',
    parent_id: null,
    path: 'CPA2019/CH3/S34',
    order: 3,
    node_type: 'section',
    content_type: 'statute',
    act_id: 'CPA2019',
    chapter_number: 3,
    section_number: 34,
    subsection_number: 1,
    official_text:
      'Section 34: Jurisdiction of District Commission. Subject to the other provisions of this Act, the District Commission shall have jurisdiction to entertain complaints where the value of the goods or services paid as consideration does not exceed fifty lakh rupees (₹50,000,000). A complaint shall be instituted in a District Commission within the local limits of whose jurisdiction the complainant resides or personally works for gain.',
    citations: [
      {
        source_act: 'The Consumer Protection Act, 2019',
        section: 'Section 34',
        title: 'Jurisdiction of District Commission',
      },
    ],
    relationships: [],
    document: {
      title: 'District Commission Jurisdiction Gazette',
    },
    metadata: {
      token_count: 110,
      checksum: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      last_updated: '2026-01-15T00:00:00Z',
    },
  },
];
