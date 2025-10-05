import { fetch } from 'undici';
import pRetry, { Options as RetryOptions } from 'p-retry';
import PQueue from 'p-queue';
import Bottleneck from 'bottleneck';
import { logger } from './logger.js';

const defaultRetry: RetryOptions = {
  retries: 3,
  factor: 2,
  minTimeout: 500,
  randomize: true
};

const limiter = new Bottleneck({
  maxConcurrent: Number(process.env.HTTP_MAX_CONCURRENCY ?? 5),
  minTime: Number(process.env.HTTP_MIN_TIME ?? 150)
});

const queue = new PQueue({
  concurrency: Number(process.env.HTTP_QUEUE_CONCURRENCY ?? 5)
});

export interface HttpResponse<T> {
  data: T;
  headers: Headers;
  status: number;
}

export async function httpJson<T>(url: string, init?: RequestInit, retry: RetryOptions = defaultRetry): Promise<HttpResponse<T>> {
  return queue.add(() => limiter.schedule(() =>
    pRetry(async () => {
      const res = await fetch(url, init);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const data = (await res.json()) as T;
      return { data, headers: res.headers, status: res.status };
    }, retry)
  ));
}

export async function httpText(url: string, init?: RequestInit, retry: RetryOptions = defaultRetry): Promise<HttpResponse<string>> {
  return queue.add(() => limiter.schedule(() =>
    pRetry(async () => {
      const res = await fetch(url, init);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const data = await res.text();
      return { data, headers: res.headers, status: res.status };
    }, retry)
  ));
}

export function setRateLimits(options: { maxConcurrent?: number; minTime?: number }): void {
  if (options.maxConcurrent) {
    limiter.updateSettings({ maxConcurrent: options.maxConcurrent });
  }
  if (options.minTime) {
    limiter.updateSettings({ minTime: options.minTime });
  }
  logger.info({ options }, 'updated HTTP rate limits');
}
