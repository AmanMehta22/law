export interface InformationCheckerResult {
  readyForRag: boolean;
  missingFields: string[];
}
