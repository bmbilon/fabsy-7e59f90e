export interface TicketData {
  ticketNumber?: string;
  issueDate?: string;
  location?: string;
  officer?: string;
  officerBadge?: string;
  offenceSection?: string;
  offenceSubSection?: string;
  offenceDescription?: string;
  violation?: string;
  fineAmount?: string;
  courtDate?: string;
  courtJurisdiction?: string;
  [key: string]: unknown;
}

export interface CachedTicketData {
  ticketData: TicketData;
  cacheKey: string;
  cachedAt: string;
  expiresAt: string;
  lastAccessed: string;
}

// The public remote ticket cache was retired. Keep this compatibility surface
// temporarily so older call sites degrade to the existing in-memory/local
// handoff without sending ticket contents or legacy cache keys over the wire.
const cacheTicketData = async (
  _ticketData: TicketData,
  _customCacheKey?: string,
): Promise<null> => null;

const getCachedTicketData = async (_cacheKey: string): Promise<null> => null;
const isCacheKeyValid = async (_cacheKey: string): Promise<false> => false;
const generateCacheKey = (_ticketData: TicketData): string => "";

export const useTicketCache = () => ({
  cacheTicketData,
  getCachedTicketData,
  isCacheKeyValid,
  generateCacheKey,
  isLoading: false,
  error: null,
});
