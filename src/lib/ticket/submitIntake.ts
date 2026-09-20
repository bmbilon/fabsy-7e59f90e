export interface SavedTicketSubmission {
  submissionId: string;
  clientId: string;
  accessToken: string;
  consentFormPath: string;
}

export interface PreparedTicketSubmission {
  submissionId: string;
  clientId: string;
  accessToken: string;
  upload?: { path: string; token: string } | null;
}

export class IntakeSaveError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

export async function functionErrorDetails(error: unknown, fallback: string): Promise<{ message: string; code?: string }> {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: Response }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: unknown; code?: unknown };
        if (typeof body.error === "string" && body.error.trim()) return { message: body.error, code: typeof body.code === "string" ? body.code : undefined };
      } catch { /* Fall back when a provider response is unavailable. */ }
    }
  }
  return { message: error instanceof Error && error.message ? error.message : fallback };
}

