export class CrawlerError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;
  }
}

export class FetchError extends CrawlerError {}
export class RateLimitError extends CrawlerError {}
export class ParserError extends CrawlerError {}
export class AdapterNotFoundError extends CrawlerError {}
