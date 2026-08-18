export interface StreamHandlers {
  onStatus?: (status: string) => void;
  onToken?: (token: string) => void;
}