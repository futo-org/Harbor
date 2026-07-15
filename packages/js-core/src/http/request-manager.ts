import { HTTPError } from '../errors';

export class RequestManager {
  constructor(
    private userAgent: string,
    private timeout: number,
    private retries: number,
  ) {}

  async makeRequest(url: string, options: RequestInit = {}): Promise<Response> {
    return this.makeRequestWithRetry(url, options, 0);
  }

  private async makeRequestWithRetry(
    url: string,
    options: RequestInit = {},
    attempt: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'x-polycentric-user-agent': this.userAgent,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new HTTPError(
          `HTTP ${response.status}: ${response.statusText} - ${errorText}`,
          errorText,
        );
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (attempt >= this.retries) {
        throw error;
      }

      if (!this.isRetryableError(error)) {
        throw error;
      }

      const delay = this.calculateRetryDelay(attempt);
      await this.delay(delay);

      return this.makeRequestWithRetry(url, options, attempt + 1);
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof HTTPError) {
      const status = parseInt(error.message.match(/HTTP (\d+)/)?.[1] || '0');
      return status >= 500 && status < 600; // Server error are retryable.
    }

    if (error instanceof TypeError) {
      return true; // Network errors are retryable.
    }

    if (error instanceof Error && error.name === 'AbortError') {
      return true; // Timeout errors are retryable.
    }

    return false;
  }

  // Exponential backoff: 1s, 2s, 4s, 8s, etc. with jitter. Cap at 10 seconds.
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = 2 ** attempt * 1000;
    const jitter = Math.random() * 0.1 * baseDelay;
    return Math.min(baseDelay + jitter, 10000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
