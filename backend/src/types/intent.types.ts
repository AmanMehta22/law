export enum Intent {
  GENERAL = "GENERAL",
  CASE = "CASE",
  DOCUMENT = "DOCUMENT",
}

export interface IntentResult {
  intent: Intent;
}
