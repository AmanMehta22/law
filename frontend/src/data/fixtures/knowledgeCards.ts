import { V2KnowledgeCard } from '../../types/knowledgeCard';

export const mockKnowledgeCards: V2KnowledgeCard[] = [
  {
    concept_id: 'definition.consumer',
    concept_type: 'definition',
    title: 'Definition of a Consumer',
    description: 'Under CPA 2019, any individual buying goods or hiring services for personal use is a protected consumer.',
    content: {
      summary: 'A consumer is anyone who buys goods or services for consideration (paid or promised) for personal use, offline or online, including e-commerce transactions.',
      key_points: [
        'Includes e-commerce, direct selling, and tele-shopping purchases.',
        'Covers goods bought on partial or deferred payment.',
        'Explicitly excludes purchases made for commercial resale or business profit.'
      ],
      defined_term: 'Consumer',
      applies_to: ['Online shoppers', 'Retail buyers', 'Service subscribers', 'End users of goods'],
      exclusions: ['Wholesalers buying for resale', 'Commercial businesses buying equipment for manufacturing']
    },
    derived_from: ['CPA2019-CH1-S2-7'],
    related_concepts: ['jurisdiction.district_commission', 'procedure.filing_complaint'],
    search: {
      keywords: ['consumer', 'definition', 'who is a consumer', 'e-commerce', 'damaged product', 'personal use']
    },
    metadata: {
      review_status: 'reviewed',
      confidence: 0.98,
      last_verified_by: 'Adv. S. Sharma (Supreme Court of India)',
      last_updated: '2026-01-20T10:00:00Z'
    }
  },
  {
    concept_id: 'timeline.two_years',
    concept_type: 'timeline',
    title: 'Limitation Period (2 Years)',
    description: 'A consumer complaint must be filed within 2 years from the date the problem or cause of action occurred.',
    content: {
      summary: 'You have exactly two years from the date of defect delivery, service refusal, or financial loss to file a formal complaint.',
      key_points: [
        'Clock starts on the date the defect was discovered or refund was refused.',
        'Condonation of delay is possible if you can prove genuine medical or emergency cause for missing the deadline.',
        'Written notices sent to the seller do not automatically pause or reset the 2-year statutory deadline.'
      ],
      time_limit: '2 Years (24 Months)',
      trigger_event: 'Date of delivery, date of service deficiency, or date seller formally rejected claim',
      exceptions: ['Condonation of delay granted by Commission for sufficient cause (e.g. hospitalization, fraud concealment)']
    },
    derived_from: ['CPA2019-CH3-S69-1'],
    related_concepts: ['procedure.filing_complaint', 'jurisdiction.district_commission'],
    search: {
      keywords: ['timeline', 'limitation period', 'time limit', '2 years', 'deadline', 'when to file']
    },
    metadata: {
      review_status: 'reviewed',
      confidence: 0.96,
      last_verified_by: 'Legal Bot Panel',
      last_updated: '2026-01-20T10:00:00Z'
    }
  },
  {
    concept_id: 'jurisdiction.district_commission',
    concept_type: 'jurisdiction',
    title: 'District Consumer Commission Jurisdiction',
    description: 'Handles consumer complaints for goods or services valued up to ₹50 Lakhs.',
    content: {
      summary: 'The District Commission is the first-level forum for all disputes where total consideration paid is under ₹50 Lakhs. You can file where you live or work.',
      key_points: [
        'Pecuniary jurisdiction was revised to ₹50 Lakhs under CPA 2019 rules.',
        'Territorial flexibility: File in the district where the consumer resides, not necessarily where seller is based.',
        'E-filing supported via the official e-Daakhil portal (edaakhil.nic.in).'
      ],
      forum_name: 'District Consumer Disputes Redressal Commission (DCDRC)',
      pecuniary_limit: 'Up to ₹50,000,000 (₹50 Lakhs)',
      appellate_authority: 'State Consumer Disputes Redressal Commission (SCDRC) within 45 days'
    },
    derived_from: ['CPA2019-CH3-S34'],
    related_concepts: ['procedure.filing_complaint', 'definition.consumer'],
    search: {
      keywords: ['jurisdiction', 'district commission', 'where to file', '50 lakhs', 'e-daakhil', 'forum']
    },
    metadata: {
      review_status: 'reviewed',
      confidence: 0.95,
      last_verified_by: 'Legal Bot Panel',
      last_updated: '2026-01-20T10:00:00Z'
    }
  },
  {
    concept_id: 'procedure.filing_complaint',
    concept_type: 'procedure',
    title: 'Step-by-Step Procedure to File a Complaint',
    description: 'Standard procedure from sending a legal notice to e-filing on e-Daakhil or visiting the District Commission.',
    content: {
      summary: 'Filing a consumer complaint requires 4 clear steps: formal written notice to seller, compiling evidence, filing via e-Daakhil or offline, and appearing for hearing.',
      key_points: [
        'Step 1: Issue a formal legal notice giving seller 15 days to resolve defect/refund.',
        'Step 2: Gather invoice, photos/videos of defect, communication logs, and payment proof.',
        'Step 3: Submit complaint on e-Daakhil portal or physical counter with minimal court fee.',
        'Step 4: Attend hearing (lawyer is optional; consumers can represent themselves).'
      ],
      steps: [
        { step_number: 1, title: 'Send Formal Legal Notice', description: 'Give 15 days written notice to seller via email or registered post.' },
        { step_number: 2, title: 'Gather Documents', description: 'Collect invoice, payment receipt, email trail, and defect photos.' },
        { step_number: 3, title: 'File on e-Daakhil', description: 'Register on edaakhil.nic.in and upload complaint draft and affidavit.' },
        { step_number: 4, title: 'Commission Hearing', description: 'Track admission hearing. Court fee is minimal (free up to ₹5 Lakhs).' }
      ],
      required_documents: ['Purchase Tax Invoice', 'Proof of Payment', 'Photos/Videos of Defect', 'Copy of Legal Notice sent to seller', 'Aadhaar/ID proof of complainant'],
      responsible_authority: 'District Consumer Disputes Redressal Commission'
    },
    derived_from: ['CPA2019-CH3-S34', 'CPA2019-CH3-S69-1'],
    related_concepts: ['jurisdiction.district_commission', 'timeline.two_years'],
    search: {
      keywords: ['procedure', 'how to file', 'complaint steps', 'e-daakhil', 'legal notice', 'documents required']
    },
    metadata: {
      review_status: 'reviewed',
      confidence: 0.97,
      last_verified_by: 'Legal Bot Panel',
      last_updated: '2026-01-20T10:00:00Z'
    }
  }
];
