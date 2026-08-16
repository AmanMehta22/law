import {
  DOCUMENT_TEMPLATES,
  DocumentTemplate,
} from "../templates/documentTemplates";

class DocumentTemplateService {
  listTemplates(): DocumentTemplate[] {
    return DOCUMENT_TEMPLATES;
  }

  selectTemplate(message: string): DocumentTemplate {
    const normalized = message.toLowerCase();

    let best: DocumentTemplate | null = null;
    let bestScore = 0;

    for (const template of DOCUMENT_TEMPLATES) {
      const score = template.matchKeywords.reduce(
        (sum, keyword) => (normalized.includes(keyword) ? sum + 1 : sum),
        0,
      );

      if (score > bestScore) {
        bestScore = score;
        best = template;
      }
    }

    return best ?? DOCUMENT_TEMPLATES[2];
  }
}

export const documentTemplateService = new DocumentTemplateService();