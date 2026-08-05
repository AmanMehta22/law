import { RequiredField } from "../../types/domain.types";

export const CONSUMER_INFORMATION_REQUIREMENTS: RequiredField[] = [
  {
    id: "productOrService",
    label: "Product or Service",
    priority: 1,
    required: true,
    question: "What product or service is your complaint about?",
    description:
      "Identify the product or service involved in the consumer dispute.",
  },

  {
    id: "issue",
    label: "Issue",
    priority: 2,
    required: true,
    question: "What exactly is the problem with the product or service?",
    description:
      "Understand the nature of the defect or deficiency in service.",
  },

  {
    id: "seller",
    label: "Seller",
    priority: 3,
    required: true,
    question: "Who sold the product or provided the service?",
    description:
      "Identify the opposite party against whom the complaint may be made.",
  },

  {
    id: "purchaseDate",
    label: "Purchase Date",
    priority: 4,
    required: true,
    question: "When did you purchase the product or service?",
    description: "Helps determine limitation periods and applicability.",
  },

  {
    id: "reliefSought",
    label: "Relief Sought",
    priority: 5,
    required: true,
    question:
      "What outcome are you looking for? (Refund, replacement, repair, compensation, etc.)",
    description: "Understand what legal remedy the user is seeking.",
  },

  {
    id: "invoiceAvailable",
    label: "Invoice Available",
    priority: 6,
    required: false,
    question: "Do you still have the purchase invoice or receipt?",
    description:
      "Useful supporting evidence but not mandatory before retrieval.",
  },

  {
    id: "communicationWithSeller",
    label: "Communication with Seller",
    priority: 7,
    required: false,
    question:
      "Have you already contacted the seller or service provider? If yes, what was their response?",
    description:
      "Useful for assessing whether the dispute has already been raised.",
  },
];
