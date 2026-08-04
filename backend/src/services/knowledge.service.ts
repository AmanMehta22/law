import { CONSUMER_INFORMATION_REQUIREMENTS } from "../knowledge/consumer/consumer.fields";

class KnowledgeService {
  getNextRequirement(missingFields: string[]) {
    return CONSUMER_INFORMATION_REQUIREMENTS.filter((field) =>
      missingFields.includes(field.id),
    ).sort((a, b) => a.priority - b.priority)[0];
  }
}

export const knowledgeService = new KnowledgeService();
