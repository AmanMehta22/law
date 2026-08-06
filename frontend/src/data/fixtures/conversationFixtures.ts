import { mockKnowledgeCards } from './knowledgeCards';
import { mockStatuteNodes } from './statuteNodes';
import { Message, IntakeContext, DocumentDraft } from '../../types/conversation';

export function createWelcomeQuickReplies(): string[] {
  return [
    'My product arrived damaged',
    'Seller won\'t refund me',
    'Charged but never got delivery',
    'How long do I have to file?'
  ];
}

export function generateLegalNoticeDraft(
  issue: string = 'Defective Electronics Purchase',
  sellerName: string = '[Seller / E-Commerce Platform Name]',
  amount: string = '₹15,000',
  state: string = 'Maharashtra'
): DocumentDraft {
  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return {
    id: 'draft_notice_' + Math.random().toString(36).substring(2, 9),
    title: 'FORMAL LEGAL NOTICE FOR DEFECTIVE GOODS & REFUND CLAIM',
    type: 'notice',
    target_authority: 'Manager / Grievance Officer, ' + sellerName,
    created_at: new Date().toISOString(),
    body: `LEGAL NOTICE UNDER SECTION 39(1) OF THE CONSUMER PROTECTION ACT, 2019

Date: ${currentDate}

BY REGISTERED A.D. / SPEED POST / EMAIL

TO:
The Manager / Grievance Officer
${sellerName}
Registered Address: [Seller Address / Email]

SUBJECT: LEGAL NOTICE FOR REFUND OF ${amount} AND COMPENSATION FOR DEFECTIVE GOODS / DEFICIENCY OF SERVICE

Dear Sir/Madam,

Under instructions from my Client, an aggrieved Consumer residing in ${state}, I hereby issue this Formal Legal Notice to you as follows:

1. That my Client purchased a product/service ("Subject Item") from your platform/store vide Order/Invoice No. [Insert Invoice Number] dated [Insert Date] for a total consideration of ${amount}.

2. That upon receipt/usage, the Subject Item was found to suffer from severe manufacturing defects / non-delivery / defect (${issue}), rendering it unserviceable and unfit for its intended purpose.

3. That despite repeated communications and customer support tickets, you have refused / failed to replace the defective item or issue a full refund of ${amount}, amounting to an Unfair Trade Practice and Deficiency of Service under Section 2(11) and Section 2(47) of the Consumer Protection Act, 2019.

4. YOU ARE HEREBY CALLED UPON to comply with the following demands within FIFTEEN (15) DAYS of receipt of this Notice:
   a) Refund the full amount of ${amount} along with interest @ 12% p.a. from the purchase date;
   b) Pay an amount of ₹10,000 towards compensation for mental agony and costs of this notice.

Take notice that if you fail to comply within 15 days, my Client shall institute formal legal proceedings against you before the District Consumer Disputes Redressal Commission at ${state} under Section 34 of the Consumer Protection Act, 2019, at your sole risk, cost, and consequences.

Yours faithfully,

[Consumer Name / Legal Representative]
Address: [Complainant Address]
Contact: [Mobile / Email]`
  };
}

export function processUserQuery(
  conversationId: string,
  userMessageText: string,
  context?: IntakeContext
): Message {
  const lowerMsg = userMessageText.toLowerCase();

  // Out of scope check
  if (
    lowerMsg.includes('divorce') ||
    lowerMsg.includes('murder') ||
    lowerMsg.includes('bail') ||
    lowerMsg.includes('income tax') ||
    lowerMsg.includes('property registration')
  ) {
    return {
      message_id: 'msg_' + Math.random().toString(36).substring(2, 10),
      conversation_id: conversationId,
      created_at: new Date().toISOString(),
      sender: 'bot',
      answer_text:
        'This query falls outside the coverage of the Consumer Protection Act, 2019. LegalBot CPA is specifically focused on consumer disputes (defective goods, service deficiencies, refund refusals, and misleading ads). For issues like family law or property registration, please consult a specialized legal counsel.',
      answer_format: 'text',
      cards_used: [],
      v1_nodes_used: [],
      overall_confidence: 0.2,
      overall_review_status: 'draft',
      disclaimer: 'Out-of-scope query declined gracefully.',
      suggested_follow_ups: [
        'My online order arrived damaged',
        'How do I file a consumer complaint?',
        'What is the 2-year deadline?'
      ],
      is_out_of_scope: true,
    };
  }

  // Intake Quick Reply Step 1 -> Ask for Amount Band
  if (
    lowerMsg.includes('damaged') ||
    lowerMsg.includes('refund') ||
    lowerMsg.includes('charged') ||
    lowerMsg.includes('seller won')
  ) {
    if (!context?.amount_band) {
      return {
        message_id: 'msg_' + Math.random().toString(36).substring(2, 10),
        conversation_id: conversationId,
        created_at: new Date().toISOString(),
        sender: 'bot',
        answer_text:
          'I can help you resolve this. Under the Consumer Protection Act, 2019, you are entitled to a full refund or replacement if goods arrive damaged or services are deficient. \n\nTo guide you to the exact forum and procedure, please select the approximate value of your purchase:',
        answer_format: 'quick_reply',
        quick_replies: [
          'Under ₹5 Lakhs',
          '₹5 Lakhs to ₹50 Lakhs',
          'Above ₹50 Lakhs'
        ],
        cards_used: [mockKnowledgeCards[0], mockKnowledgeCards[2]],
        v1_nodes_used: [mockStatuteNodes[0], mockStatuteNodes[2]],
        overall_confidence: 0.96,
        overall_review_status: 'reviewed',
        disclaimer:
          'This is general legal information based on the Consumer Protection Act, 2019, not legal advice.',
        suggested_follow_ups: ['What are the steps to file a complaint?'],
      };
    }
  }

  // Intake Quick Reply Step 2 -> Ask for State
  if (context?.amount_band && !context?.state) {
    return {
      message_id: 'msg_' + Math.random().toString(36).substring(2, 10),
      conversation_id: conversationId,
      created_at: new Date().toISOString(),
      sender: 'bot',
      answer_text:
        `Thank you. Claims ${context.amount_band.toLowerCase().includes('above') ? 'above ₹50 Lakhs go to the State Commission' : 'up to ₹50 Lakhs are heard by your local District Commission'} under Section 34 of the Act.\n\nWhich state do you reside in? (You can file where you live, regardless of where the seller is located)`,
      answer_format: 'quick_reply',
      quick_replies: ['Maharashtra', 'Delhi NCR', 'Karnataka', 'Tamil Nadu', 'Other State'],
      cards_used: [mockKnowledgeCards[2]],
      v1_nodes_used: [mockStatuteNodes[2]],
      overall_confidence: 0.95,
      overall_review_status: 'reviewed',
      disclaimer: 'General legal information under CPA 2019 Section 34.',
      suggested_follow_ups: ['Show me the procedural steps', 'Draft a legal notice for me'],
    };
  }

  // If user requests a NOTICE or DRAFT
  if (
    lowerMsg.includes('draft') ||
    lowerMsg.includes('notice') ||
    lowerMsg.includes('legal notice') ||
    lowerMsg.includes('write')
  ) {
    const draftObj = generateLegalNoticeDraft(
      'Defective Item / Refund Refusal',
      '[Seller / Platform Name]',
      context?.amount_band || '₹15,000',
      context?.state || 'Maharashtra'
    );

    return {
      message_id: 'msg_' + Math.random().toString(36).substring(2, 10),
      conversation_id: conversationId,
      created_at: new Date().toISOString(),
      sender: 'bot',
      answer_text:
        'Here is a formal Legal Notice template customized for your case under Section 39(1) of the Consumer Protection Act, 2019. You can edit any field directly in the text box below before downloading or printing it. Sending this notice via registered post or email gives the seller 15 days to resolve the dispute before court filing.',
      answer_format: 'document_draft',
      document_draft: draftObj,
      cards_used: [mockKnowledgeCards[0], mockKnowledgeCards[3]],
      v1_nodes_used: [mockStatuteNodes[0], mockStatuteNodes[2]],
      overall_confidence: 0.96,
      overall_review_status: 'reviewed',
      disclaimer:
        'DRAFT FOR REVIEW — This document is generated for informational preparation and must be reviewed prior to sending.',
      suggested_follow_ups: [
        'What documents do I need to attach?',
        'How do I file on e-Daakhil if they ignore this notice?'
      ],
    };
  }

  // If user requests STEPS, PROCEDURE, CHECKLIST
  if (
    lowerMsg.includes('step') ||
    lowerMsg.includes('procedure') ||
    lowerMsg.includes('how to file') ||
    lowerMsg.includes('checklist') ||
    lowerMsg.includes('process')
  ) {
    const procCard = mockKnowledgeCards.find((c) => c.concept_id === 'procedure.filing_complaint') || mockKnowledgeCards[3];

    return {
      message_id: 'msg_' + Math.random().toString(36).substring(2, 10),
      conversation_id: conversationId,
      created_at: new Date().toISOString(),
      sender: 'bot',
      answer_text:
        'Here is the complete step-by-step procedural roadmap for filing a consumer complaint under Section 34 & 39 of CPA 2019. You can complete these steps online via the e-Daakhil portal or at your local District Commission counter without hiring a lawyer:',
      answer_format: 'checklist',
      checklist_ref: procCard,
      cards_used: [procCard, mockKnowledgeCards[1], mockKnowledgeCards[2]],
      v1_nodes_used: [mockStatuteNodes[1], mockStatuteNodes[2]],
      overall_confidence: 0.97,
      overall_review_status: 'reviewed',
      disclaimer: 'General procedural guidance based on CPA 2019 e-Daakhil rules.',
      suggested_follow_ups: [
        'Draft a legal notice for step 1',
        'What is the 2-year deadline limit?'
      ],
    };
  }

  // If user asks about TIMELINE or DEADLINE
  if (
    lowerMsg.includes('time') ||
    lowerMsg.includes('limit') ||
    lowerMsg.includes('deadline') ||
    lowerMsg.includes('2 year') ||
    lowerMsg.includes('how long')
  ) {
    const timeCard = mockKnowledgeCards.find((c) => c.concept_id === 'timeline.two_years') || mockKnowledgeCards[1];

    return {
      message_id: 'msg_' + Math.random().toString(36).substring(2, 10),
      conversation_id: conversationId,
      created_at: new Date().toISOString(),
      sender: 'bot',
      answer_text:
        'Under Section 69(1) of the Consumer Protection Act, 2019, you have exactly **two (2) years** from the date the cause of action arose (e.g. date of product delivery, date refund was refused, or date service was deficient) to file a complaint.\n\nKey details:\n• The 2-year clock starts when the defect or refusal happens.\n• Sending written emails to the seller does not automatically pause the 2-year timer.\n• If you missed the deadline due to genuine emergencies (like illness), you can apply for condonation of delay with proof.',
      answer_format: 'text',
      cards_used: [timeCard, mockKnowledgeCards[2]],
      v1_nodes_used: [mockStatuteNodes[1], mockStatuteNodes[2]],
      overall_confidence: 0.96,
      overall_review_status: 'reviewed',
      disclaimer: 'Grounded in CPA 2019 Section 69(1).',
      suggested_follow_ups: [
        'What are the steps to file a complaint?',
        'Draft a legal notice to send right now'
      ],
    };
  }

  // Low confidence / vague query test
  if (lowerMsg.length < 10 || lowerMsg.includes('maybe') || lowerMsg.includes('doubt')) {
    const lowConfCard = mockKnowledgeCards[0];

    return {
      message_id: 'msg_' + Math.random().toString(36).substring(2, 10),
      conversation_id: conversationId,
      created_at: new Date().toISOString(),
      sender: 'bot',
      answer_text:
        'Based on your short description, your issue appears to involve a dispute over product quality or seller representation. Under CPA 2019, consumers can claim refunds, replacements, or damages for unfair trade practices.\n\n*Note: This match is currently under review for exact statutory categorization.*',
      answer_format: 'text',
      cards_used: [lowConfCard],
      v1_nodes_used: [mockStatuteNodes[0]],
      overall_confidence: 0.68,
      overall_review_status: 'draft',
      is_low_confidence: true,
      disclaimer: 'Under review — verify statutory citation before proceeding.',
      suggested_follow_ups: [
        'Show procedural steps to file',
        'Draft a legal notice'
      ],
    };
  }

  // General grounded response fallback
  return {
    message_id: 'msg_' + Math.random().toString(36).substring(2, 10),
    conversation_id: conversationId,
    created_at: new Date().toISOString(),
    sender: 'bot',
    answer_text:
      'Under Section 2(7) of the Consumer Protection Act, 2019, anyone who purchases goods or hires services for personal consideration is a legally protected consumer. If your purchase arrived damaged, defective, or wasn\'t delivered, the seller or platform is legally obligated under Section 39(1) to either replace the item or grant a full refund.\n\nYou do not need a lawyer to seek redress — you can issue a 15-day formal legal notice and file directly on the government\'s e-Daakhil portal.',
    answer_format: 'text',
    cards_used: [mockKnowledgeCards[0], mockKnowledgeCards[2], mockKnowledgeCards[3]],
    v1_nodes_used: [mockStatuteNodes[0], mockStatuteNodes[2]],
    overall_confidence: 0.95,
    overall_review_status: 'reviewed',
    disclaimer:
      'This is general legal information based on the Consumer Protection Act, 2019, not legal advice.',
    suggested_follow_ups: [
      'What are the steps to file a complaint?',
      'Draft a legal notice for me',
      'What is the 2-year time limit?'
    ],
  };
}
