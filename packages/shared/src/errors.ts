export class CrawlerError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class FetchError extends CrawlerError {}
export class RateLimitError extends CrawlerError {}
export class ParserError extends CrawlerError {}
export class AdapterNotFoundError extends CrawlerError {}
