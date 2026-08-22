export type DocumentKind = "notice" | "complaint" | "checklist";

export interface DocumentTemplate {
  id: string;
  name: string;
  kind: DocumentKind;
  description: string;
  matchKeywords: string[];
  structure: string;
}

export const LEGAL_NOTICE_TEMPLATE: DocumentTemplate = {
  id: "legal-notice",
  name: "Legal Notice under the Consumer Protection Act, 2019",
  kind: "notice",
  description:
    "Formal pre-litigation notice to the seller or service provider demanding redress before filing a consumer complaint.",
  matchKeywords: ["notice", "legal notice", "demand letter", "send notice"],
  structure: `[Your Name]
[Your Address]
[City, State, PIN Code]
Date: [Date]

To,
[Recipient Name / Company Name]
[Recipient Address]

Subject: Legal Notice for [defect in goods / deficiency in service] under the Consumer Protection Act, 2019

Sir/Madam,

1. FACTS: The sender purchased [description of goods or service] from [recipient] on [date] for a consideration of [amount], as per invoice no. [invoice number]. A copy of the invoice is retained.

2. DEFECT/DEFICIENCY: [Describe the defect in the goods under Section 2(10) or the deficiency in service under Section 2(11) of the Act, with dates and details.]

3. COMPLAINTS MADE: The sender brought the above to the recipient's attention on [date(s)] by [mode of communication], but the recipient [failed to respond / refused / delayed redress]. Copies of the correspondence are retained.

4. LEGAL GROUNDS: The sender is a 'consumer' within the meaning of Section 2(7) of the Consumer Protection Act, 2019. The recipient is a 'product seller' within the meaning of Section 2(37) and/or a provider of 'service' within the meaning of Section 2(42). The above conduct constitutes [a defect / a deficiency / an unfair trade practice within the meaning of Section 2(47)] under the Act.

5. DEMAND: By this notice, the sender calls upon the recipient to [refund the amount of [amount] / replace the goods / repair the goods / pay compensation of [amount]] within [number] days of receipt of this notice, failing which the sender shall be constrained to initiate legal proceedings.

6. CONSEQUENCES: If the demand is not complied with, the sender shall file a complaint before the appropriate Consumer Commission having pecuniary jurisdiction under Section 34, 47 or 58 of the Act, within the limitation period of two years under Section 69, and shall claim relief under Section 39, including compensation for mental agony and the costs of proceedings.

This notice is without prejudice to the sender's rights and remedies.

Yours faithfully,
[Signature]
[Name]
[Phone Number]
[Email]`,
};

export const COMPLAINT_TEMPLATE: DocumentTemplate = {
  id: "consumer-complaint",
  name: "Consumer Complaint to the District Commission",
  kind: "complaint",
  description:
    "Complaint in the format prescribed under the Consumer Protection (Consumer Commissions Procedure) Regulations, 2020, for filing before the District Commission.",
  matchKeywords: [
    "complaint",
    "file a complaint",
    "file case",
    "district commission",
    "consumer court",
  ],
  structure: `BEFORE THE HON'BLE DISTRICT CONSUMER DISPUTES REDRESSAL COMMISSION, [District]
Consumer Complaint No. ____ of [Year]

IN THE MATTER OF:

[Complainant Name], [father's/husband's name], aged about [age] years, residing at [full address]
                                                      ... Complainant

VERSUS

[Opposite Party Name], [proprietorship/company registration details], having its registered office at [address]
                                                      ... Opposite Party

COMPLAINT UNDER SECTION 35 READ WITH SECTION 34(1) OF THE CONSUMER PROTECTION ACT, 2019

1. PARTICULARS OF THE COMPLAINANT: [Name, address, contact number, email]

2. PARTICULARS OF THE OPPOSITE PARTY: [Name, registered office/place of business, contact details]

3. JURISDICTION OF THE COMMISSION: The value of the goods or services paid as consideration is [amount], which is within the pecuniary jurisdiction of this Commission under Section 34(1) of the Consumer Protection Act, 2019 (one crore rupees as enacted, subject to any other value prescribed by the Central Government under the proviso to that sub-section - verify the value in force before filing). The cause of action arose within the territorial jurisdiction of this Commission under Section 34(2).

4. FACTS OF THE CASE: On [date], the complainant purchased [goods/service] from the opposite party for a consideration of [amount] as per invoice no. [invoice number]. The complainant has been using the same in the ordinary course.

5. DEFECT/DEFICIENCY: [Describe the defect under Section 2(10) or deficiency under Section 2(11) with particulars.]

6. EFFORTS MADE FOR REDRESS: The complainant approached the opposite party on [date] by [mode], but the opposite party [refused/failed] to redress the grievance. Copies of the correspondence are filed herewith.

7. CAUSE OF ACTION: The cause of action arose on [date], when the opposite party [refused redress / the defect became apparent], within the jurisdiction of this Commission.

8. LIMITATION: The complaint is filed within two years of the cause of action as required under Section 69(1) of the Act.

9. RELIEF SOUGHT: The complainant prays for the following reliefs under Section 39 of the Act:
   a) [Refund of the amount of [amount] / Replacement of the goods / Repair of the goods];
   b) Compensation of [amount] for mental agony and physical harassment;
   c) Litigation costs; and
   d) Any other relief this Hon'ble Commission deems fit.

VERIFICATION
I, [Name], the complainant above named, do hereby verify that the contents of paragraphs 1 to 9 of this complaint are true and correct to my knowledge and belief and nothing material has been concealed.

Place: [Place]
Date: [Date]

[Signature]
[Name of Complainant]`,
};

export const FILING_CHECKLIST_TEMPLATE: DocumentTemplate = {
  id: "filing-checklist",
  name: "Consumer Complaint Filing Checklist",
  kind: "checklist",
  description:
    "Step-by-step checklist of pre-filing checks, documents, and drafting steps for filing a consumer complaint.",
  matchKeywords: [
    "checklist",
    "documents needed",
    "what documents",
    "how to file",
    "steps to file",
  ],
  structure: `CONSUMER COMPLAINT FILING CHECKLIST
(Consumer Protection Act, 2019)

1. PRE-FILING CHECKS
   [ ] Confirm you are a 'consumer' as defined in Section 2(7) of the Act
   [ ] Confirm pecuniary jurisdiction: the value of the goods or services paid as consideration does not exceed the limit for the chosen Commission (Section 34(1) - District, Section 47(1)(a)(i) - State, Section 58(1)(a)(i) - National). The Act does not add compensation claimed to that value, and each of those provisions lets the Central Government prescribe some other value.
   [ ] Confirm limitation: complaint filed within two years of the cause of action (Section 69)

2. DOCUMENTS TO COLLECT
   [ ] Invoice / cash memo / bill of sale
   [ ] Warranty or guarantee card (if applicable)
   [ ] Proof of payment (bank statement, UPI receipt, card slip, EMI statement)
   [ ] Correspondence with the seller or service provider (emails, messages, call logs, complaints)
   [ ] Photographs or videos of the defective goods or deficient service
   [ ] Copy of the legal notice sent to the opposite party (if any)
   [ ] Identity proof of the complainant
   [ ] Address proof of the complainant and the opposite party

3. DRAFTING THE COMPLAINT
   [ ] Draft complaint in the format prescribed under the Consumer Protection (Consumer Commissions Procedure) Regulations, 2020
   [ ] Include particulars of both parties, jurisdiction, facts, defect/deficiency, cause of action, limitation, and relief sought
   [ ] Sign the verification clause

4. FILING
   [ ] File the complaint before the appropriate Consumer Commission
   [ ] Pay the prescribed filing fee as per the applicable rules
   [ ] Obtain the acknowledgement and note the complaint/case number
   [ ] Preserve all originals; file only copies where required`,
};

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  LEGAL_NOTICE_TEMPLATE,
  COMPLAINT_TEMPLATE,
  FILING_CHECKLIST_TEMPLATE,
];