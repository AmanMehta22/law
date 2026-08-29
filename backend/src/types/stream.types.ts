export interface StreamHandlers {
  onStatus?: (status: string) => void;
  onToken?: (token: string) => void;
  /**
   * Aborted when the HTTP client disconnects mid-stream, so in-flight LLM
   * generation stops burning provider quota for a response nobody reads.
   */
  signal?: AbortSignal;
}