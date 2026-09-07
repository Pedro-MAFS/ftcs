type FetchFn = typeof globalThis.fetch;

let cachedFetch: FetchFn | undefined;
let initPromise: Promise<void> | undefined;

function readProxyUrl(): string {
  return (
    process.env.FTCS_GOOGLE_PROXY_URL?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    ""
  );
}

async function buildFetch(proxyUrl: string): Promise<FetchFn> {
  const { ProxyAgent, fetch: undiciFetch } = await import("undici");

  if (/^socks/i.test(proxyUrl)) {
    const { SocksProxyAgent } = await import("socks-proxy-agent");
    const agent = new SocksProxyAgent(proxyUrl);
    return ((input: RequestInfo | URL, init?: RequestInit) =>
      undiciFetch(input as never, {
        ...init,
        dispatcher: agent as never,
      } as never)) as unknown as FetchFn;
  }

  const agent = new ProxyAgent(proxyUrl);
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(input as never, {
      ...init,
      dispatcher: agent,
    } as never)) as unknown as FetchFn;
}

/** 启动时调用：无代理时不加载 undici，有代理时按需安装并加载外部依赖。 */
export async function initPlacesFetch(): Promise<void> {
  if (cachedFetch) return;
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    const proxyUrl = readProxyUrl();
    cachedFetch = proxyUrl ? await buildFetch(proxyUrl) : globalThis.fetch;
  })();

  try {
    await initPromise;
  } catch (error) {
    initPromise = undefined;
    cachedFetch = undefined;
    throw error;
  }
}

/** Places 出站 fetch；须先 await initPlacesFetch()。 */
export function getPlacesFetch(): FetchFn {
  if (!cachedFetch) {
    throw new Error("Places fetch 尚未初始化，请先调用 initPlacesFetch()");
  }
  return cachedFetch;
}
