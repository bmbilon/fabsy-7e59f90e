import { ApiError, uploadToSignedUrl } from '../api';

export type TransferStatus = 'waiting' | 'uploading' | 'done' | 'failed';

export interface TransferState {
  status: TransferStatus;
  /** Fraction of the file sent, 0 to 1. */
  fraction: number;
}

export interface UploadJob {
  /** Local file id; progress and results are reported against it. */
  key: string;
  signedUrl: string;
  file: Blob;
  name: string;
  contentType: string;
}

export interface UploadOutcome {
  succeeded: string[];
  failed: string[];
}

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

function retryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}

async function uploadWithRetry(job: UploadJob, onProgress: (fraction: number) => void): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await uploadToSignedUrl(job.signedUrl, job.file, job.name, job.contentType, { onProgress });
      return true;
    } catch (error) {
      // A retry that finds the object already stored means the first attempt arrived.
      if (attempt > 0 && error instanceof ApiError && error.duplicate) return true;
      if (attempt > 0 || !retryable(error)) return false;
      onProgress(0);
      await sleep(1200);
    }
  }
  return false;
}

/** Uploads every job, two at a time by default, with one retry for network and server errors. */
export async function runUploads(jobs: UploadJob[], onChange: (key: string, state: TransferState) => void, concurrency = 2): Promise<UploadOutcome> {
  const succeeded: string[] = [];
  const failed: string[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      onChange(job.key, { status: 'uploading', fraction: 0 });
      const ok = await uploadWithRetry(job, fraction => onChange(job.key, { status: 'uploading', fraction }));
      onChange(job.key, { status: ok ? 'done' : 'failed', fraction: ok ? 1 : 0 });
      (ok ? succeeded : failed).push(job.key);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, jobs.length)) }, worker));
  return { succeeded, failed };
}

/** Retries a request a few times when the network or server hiccups. */
export async function withRetry<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!retryable(error) || attempt === attempts - 1) break;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastError;
}

/** Bots are filtered on the server when a form is sent within 2.5 s of page load; never let a fast person trip it. */
export async function waitForHumanPace(minimumMs = 3000): Promise<number> {
  const elapsed = Math.round(performance.now());
  if (elapsed < minimumMs) await sleep(minimumMs - elapsed);
  return Math.round(performance.now());
}
