class TitleService {
  private readonly MAX_TITLE_LENGTH = 60;

  generate(message: string): string {
    const cleaned = message.trim().replace(/\s+/g, " ");

    if (cleaned.length <= this.MAX_TITLE_LENGTH) {
      return cleaned;
    }

    return cleaned.slice(0, this.MAX_TITLE_LENGTH).trimEnd() + "...";
  }
}

export const titleService = new TitleService();
