export type AIErrorCategory =
    | 'rate_limit'
    | 'auth'
    | 'model_not_found'
    | 'timeout'
    | 'network'
    | 'invalid_request'
    | 'other';

export interface AIErrorInfo {
    category: AIErrorCategory;
    detail: string;
    httpStatus?: number;
    message: string;
}

const STATUS_CATEGORY: Record<number, AIErrorCategory> = {
    400: 'invalid_request',
    401: 'auth',
    403: 'other',
    404: 'model_not_found',
    408: 'timeout',
    409: 'invalid_request',
    422: 'invalid_request',
    429: 'rate_limit',
    500: 'other',
    502: 'other',
    503: 'other',
    504: 'timeout',
};

const KEYWORD_CATEGORIES: Array<[RegExp, AIErrorCategory]> = [
    [/rate limit|rate_limit|quota|too many requests|usage limit|resource_exhausted/i, 'rate_limit'],
    [/invalid api key|incorrect api key|api key.*invalid|unauthorized|authentication failed|authentication required|invalid credential|permission denied/i, 'auth'],
    [/model not found|model does not exist|no such model|unknown model|not found.*model/i, 'model_not_found'],
    [/timed? ?out|ETIMEDOUT|timeout exceeded|timeout_ms/i, 'timeout'],
    [/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|fetch failed|socket hang up|network|connection refused|tunneling socket|lookup/i, 'network'],
    [/blocked|safety|harmful|finish_reason.*safety/i, 'invalid_request'],
    [/invalid request|bad request|invalid parameter|invalid json/i, 'invalid_request'],
];

export function classifyAIError(error: any): AIErrorInfo {
    const status = error?.status || error?.statusCode || error?.response?.status;
    const detail = String(error?.message || error || '').trim();

    const httpStatus = typeof status === 'number' ? status : undefined;

    for (const [pattern, category] of KEYWORD_CATEGORIES) {
        if (pattern.test(detail)) {
            return { category, detail, httpStatus, message: '' };
        }
    }

    if (httpStatus && STATUS_CATEGORY[httpStatus]) {
        return { category: STATUS_CATEGORY[httpStatus], detail, httpStatus, message: '' };
    }

    return { category: 'other', detail, httpStatus, message: '' };
}

const CATEGORY_MESSAGES: Record<AIErrorCategory, (provider: string) => string> = {
    rate_limit: (p) => `⚠️ I hit a rate limit from ${p}. Give me a minute, then try again.`,
    auth: (p) => `🔑 ${p} rejected the API key. Update it in Settings → AI Configuration.`,
    model_not_found: (p) => `❓ ${p} doesn't have the model that's selected. Pick a valid one in Settings → AI Configuration.`,
    timeout: (p) => `⏱️ ${p} took too long to respond. Try again in a moment.`,
    network: (p) => `📡 I couldn't reach ${p}. Check your internet connection and try again.`,
    invalid_request: (p) => `⚠️ ${p} rejected the request. Check the configuration in Settings → AI Configuration.`,
    other: (p) => `⚠️ Something went wrong while generating a reply from ${p}. Try again.`,
};

export function friendlyAIErrorMessage(info: AIErrorInfo, providerName: string): string {
    const base = CATEGORY_MESSAGES[info.category](providerName);
    const hasDetail = typeof info.detail === 'string' && info.detail.length > 0 && info.detail !== '[object Object]';
    const detail = hasDetail && info.category === 'other'
        ? ` (${info.detail.slice(0, 160)})`
        : '';
    return base + detail;
}