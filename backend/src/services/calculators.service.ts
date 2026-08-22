/**
 * Deterministic calculators, computed from the Consumer Protection Act, 2019
 * AS ENACTED and from nothing else.
 *
 * WHY THE THRESHOLDS ARE ONE CRORE AND TEN CRORE
 * ----------------------------------------------
 * This file previously used fifty lakh and two crore. Those are values the
 * Central Government PRESCRIBED after enactment; they are not in the Act. The
 * code nevertheless attributed them to "Section 34(1)(a)" and "Section 47(1)(a)",
 * so it put words in the Act's mouth - and "Section 34(1)(a)" does not exist,
 * because s.34(1) has no clauses.
 *
 * The Act's own words, from `final/v1-statute.jsonl` (verified against the
 * Gazette PDF):
 *
 *   s.34(1)       "... does not exceed one crore rupees: Provided that where the
 *                 Central Government deems it necessary so to do, it may
 *                 prescribe such other value, as it deems fit."
 *   s.47(1)(a)(i) "... exceeds rupees one crore, but does not exceed rupees ten
 *                 crore" + the same proviso.
 *   s.58(1)(a)(i) "... exceeds rupees ten crore" + the same proviso.
 *
 * So the Act sets these figures and simultaneously authorises the Central
 * Government to displace them. `prescribedValueNote` carries that proviso to the
 * user instead of this service inventing a number the Act does not contain: a
 * prescribed value is subordinate legislation, it is not part of the Act, and it
 * is therefore outside this project's material.
 *
 * Also corrected here: the Act measures "the value of the goods or services paid
 * as consideration". It does NOT add compensation claimed - that was the 1986
 * Act's formula, and carrying it forward inflates the claim value and can push a
 * complaint to the wrong Commission.
 */
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
  forum: "District Commission" | "State Commission" | "National Commission";
  section: string;
  valueRange: string;
  explanation: string;
  /**
   * The proviso to s.34(1) / s.47(1)(a)(i) / s.58(1)(a)(i). Always present: the
   * proviso is part of every one of those provisions, so an answer that omits it
   * misstates the Act.
   */
  prescribedValueNote: string;
}

const LIMITATION_PERIOD_YEARS = 2;

const ONE_CRORE = 10_000_000;

const TEN_CRORE = 100_000_000;

const PRESCRIBED_VALUE_NOTE =
  "These are the values enacted in the Consumer Protection Act, 2019. Each of " +
  "Sections 34(1), 47(1)(a)(i) and 58(1)(a)(i) ends with the proviso that " +
  "\"where the Central Government deems it necessary so to do, it may prescribe " +
  "such other value, as it deems fit\". A prescribed value is made by " +
  "notification and is not part of the Act, so it is outside the material this " +
  "assistant works from - check the current prescribed value before you file.";

const formatINR = (value: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

class CalculatorsService {
  calculateLimitation(causeOfActionDate: string): LimitationResult {
    const causeDate = new Date(causeOfActionDate);

const deadline = new Date(causeDate);

deadline.setFullYear(deadline.getFullYear() + LIMITATION_PERIOD_YEARS);

if (deadline.getMonth() !== causeDate.getMonth()) {
  deadline.setDate(0);
}

    const now = new Date();

    now.setHours(0, 0, 0, 0);

    const daysRemaining = Math.ceil(
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    const expired = daysRemaining < 0;

    return {
      causeOfActionDate: causeDate.toISOString().slice(0, 10),
      limitationPeriodYears: LIMITATION_PERIOD_YEARS,
      deadline: deadline.toISOString().slice(0, 10),
      daysRemaining: Math.abs(daysRemaining),
      expired,
      section: "Section 69, Consumer Protection Act, 2019",
      explanation:
        "Under Section 69(1) a Commission shall not admit a complaint unless it " +
        "is filed within two years from the date on which the cause of action " +
        "has arisen. Section 69(2) allows a later complaint to be entertained if " +
        "the complainant satisfies the Commission that he had sufficient cause " +
        "for not filing in time, and the proviso to Section 69(2) requires the " +
        "Commission to record its reasons for condoning the delay.",
    };
  }

  calculateJurisdiction(claimValue: number): JurisdictionResult {
    if (claimValue <= ONE_CRORE) {
      return {
        claimValue,
        forum: "District Commission",
        section: "Section 34(1), Consumer Protection Act, 2019",
        valueRange: `up to ${formatINR(ONE_CRORE)}`,
        explanation:
          "The District Commission has jurisdiction to entertain complaints " +
          "where the value of the goods or services paid as consideration does " +
          "not exceed one crore rupees.",
        prescribedValueNote: PRESCRIBED_VALUE_NOTE,
      };
    }

    if (claimValue <= TEN_CRORE) {
      return {
        claimValue,
        forum: "State Commission",
        section: "Section 47(1)(a)(i), Consumer Protection Act, 2019",
        valueRange: `${formatINR(ONE_CRORE + 1)} to ${formatINR(TEN_CRORE)}`,
        explanation:
          "The State Commission has jurisdiction to entertain complaints where " +
          "the value of the goods or services paid as consideration exceeds " +
          "rupees one crore but does not exceed rupees ten crore. A complaint " +
          "against an unfair contract follows a different value rule: the State " +
          "Commission entertains it where the consideration does not exceed ten " +
          "crore rupees (Section 47(1)(a)(ii)).",
        prescribedValueNote: PRESCRIBED_VALUE_NOTE,
      };
    }

    return {
      claimValue,
      forum: "National Commission",
      section: "Section 58(1)(a)(i), Consumer Protection Act, 2019",
      valueRange: `above ${formatINR(TEN_CRORE)}`,
      explanation:
        "The National Commission has jurisdiction to entertain complaints where " +
        "the value of the goods or services paid as consideration exceeds rupees " +
        "ten crore, and complaints against unfair contracts where that " +
        "consideration exceeds ten crore rupees (Section 58(1)(a)(ii)).",
      prescribedValueNote: PRESCRIBED_VALUE_NOTE,
    };
  }
}

export const calculatorsService = new CalculatorsService();