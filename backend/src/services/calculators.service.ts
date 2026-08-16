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
}

const LIMITATION_PERIOD_YEARS = 2;

const FIFTY_LAKH = 5_000_000;

const TWO_CRORE = 20_000_000;

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
        "A consumer complaint must be filed within two years from the date on which the cause of action arises. The Commission may entertain a complaint filed after this period if it is satisfied that there was sufficient cause for the delay (proviso to Section 69).",
    };
  }

  calculateJurisdiction(claimValue: number): JurisdictionResult {
    if (claimValue <= FIFTY_LAKH) {
      return {
        claimValue,
        forum: "District Commission",
        section: "Section 34(1)(a), Consumer Protection Act, 2019",
        valueRange: `up to ${formatINR(FIFTY_LAKH)}`,
        explanation:
          "The District Commission has jurisdiction where the value of the goods or services paid as consideration plus compensation claimed does not exceed fifty lakh rupees.",
      };
    }

    if (claimValue <= TWO_CRORE) {
      return {
        claimValue,
        forum: "State Commission",
        section: "Section 42(1)(a), Consumer Protection Act, 2019",
        valueRange: `${formatINR(FIFTY_LAKH + 1)} to ${formatINR(TWO_CRORE)}`,
        explanation:
          "The State Commission has jurisdiction where the value of the goods or services paid as consideration plus compensation claimed exceeds fifty lakh rupees but does not exceed two crore rupees.",
      };
    }

    return {
      claimValue,
      forum: "National Commission",
      section: "Section 58(1)(a), Consumer Protection Act, 2019",
      valueRange: `above ${formatINR(TWO_CRORE)}`,
      explanation:
        "The National Commission has jurisdiction where the value of the goods or services paid as consideration plus compensation claimed exceeds two crore rupees.",
    };
  }
}

export const calculatorsService = new CalculatorsService();