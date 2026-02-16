export class ServiceWakeupError extends Error {
  retriable: boolean;
  status?: number;

  constructor(message: string, retriable: boolean, status?: number) {
    super(message);
    this.name = 'ServiceWakeupError';
    this.retriable = retriable;
    this.status = status;
  }
}

export interface WakeupProgress {
  attempt: number;
  maxAttempts: number;
  elapsedMs: number;
  phase: 'starting' | 'retrying';
  lastError: string | null;
}

interface RequestWithWakeupOptions {
  execute: (signal: AbortSignal) => Promise<Response>;
  maxAttempts?: number;
  requestTimeoutMs?: number;
  healthCheckUrl?: string;
  onProgress?: (progress: WakeupProgress) => void;
}

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const HEALTH_CHECK_TIMEOUT_MS = 5000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getBackoffMs = (attempt: number): number => Math.min(1200 * Math.pow(2, Math.max(0, attempt - 1)), 7000);

const isRetriableStatus = (status: number): boolean => status >= 500 || status === 429 || status === 408;

const parseResponseError = async (response: Response): Promise<string> => {
  try {
    const data = await response.json();
    if (typeof data?.detail === 'string' && data.detail.trim().length > 0) {
      return data.detail;
    }
  } catch {
    // Ignore JSON parsing errors and use fallback text below.
  }

  return response.statusText || `Request failed with status ${response.status}`;
};

const fetchWithTimeout = async (
  execute: (signal: AbortSignal) => Promise<Response>,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await execute(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

const warmService = async (healthCheckUrl: string): Promise<void> => {
  try {
    await fetchWithTimeout(
      (signal) =>
        fetch(healthCheckUrl, {
          method: 'GET',
          signal,
        }),
      HEALTH_CHECK_TIMEOUT_MS,
    );
  } catch {
    // A best-effort warmup probe should never break the main request flow.
  }
};

export async function requestWithServiceWakeup({
  execute,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  healthCheckUrl,
  onProgress,
}: RequestWithWakeupOptions): Promise<Response> {
  const startedAt = Date.now();
  let lastErrorMessage: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onProgress?.({
      attempt,
      maxAttempts,
      elapsedMs: Date.now() - startedAt,
      phase: attempt === 1 ? 'starting' : 'retrying',
      lastError: lastErrorMessage,
    });

    try {
      const response = await fetchWithTimeout(execute, requestTimeoutMs);
      if (response.ok) {
        return response;
      }

      const errorMessage = await parseResponseError(response);
      const retriable = isRetriableStatus(response.status);

      if (!retriable) {
        throw new ServiceWakeupError(errorMessage, false, response.status);
      }

      lastErrorMessage = errorMessage;
      if (attempt === maxAttempts) {
        throw new ServiceWakeupError(errorMessage, true, response.status);
      }
    } catch (error) {
      if (error instanceof ServiceWakeupError) {
        if (!error.retriable || attempt === maxAttempts) {
          throw error;
        }
        lastErrorMessage = error.message;
      } else {
        const isTimeoutAbort =
          (error as { name?: string })?.name === 'AbortError' ||
          (error as Error)?.message?.toLowerCase().includes('timed out');

        lastErrorMessage = isTimeoutAbort
          ? 'Request timed out while waiting for service wake-up.'
          : (error as Error)?.message || 'Network request failed';

        if (attempt === maxAttempts) {
          throw new ServiceWakeupError(lastErrorMessage, true);
        }
      }
    }

    if (healthCheckUrl) {
      await warmService(healthCheckUrl);
    }

    await wait(getBackoffMs(attempt));
  }

  throw new ServiceWakeupError(
    lastErrorMessage || 'Service is taking longer than expected to wake up.',
    true,
  );
}

