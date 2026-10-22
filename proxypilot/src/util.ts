/** Runs `fn` over `items` with at most `limit` calls in flight, keeping results in input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

export function errorMessage(err: unknown): string {
  // Playwright errors carry a multi-line call log; the first line is the useful part.
  return (err instanceof Error ? err.message : String(err)).split('\n')[0];
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Accepts what people type in an address bar ("example.com/page") and returns a full http(s) URL. */
export function normalizeUrl(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) throw new HttpError(400, 'Enter a website address');
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new HttpError(400, `"${raw}" is not a valid web address`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'Only http:// and https:// addresses can be opened');
  }
  return url.href;
}
