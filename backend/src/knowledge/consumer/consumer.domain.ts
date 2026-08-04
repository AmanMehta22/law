import { LegalDomain } from "../../types/domain.types";
import { CONSUMER_INFORMATION_REQUIREMENTS } from "./consumer.fields";

export const CONSUMER_DOMAIN: LegalDomain = {
  id: "consumer",

  name: "Consumer Protection",

  description:
    "Consumer disputes involving defective products, deficient services, unfair trade practices, refunds, warranties and compensation.",

  requiredFields: CONSUMER_INFORMATION_REQUIREMENTS,
};
