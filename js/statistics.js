/* global CONFIG */

(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document && root.CONFIG && !root.__leanCloudStatisticsBound) {
    root.__leanCloudStatisticsBound = true;
    const adapter = api.createAdapter({
      config: root.CONFIG,
      document: root.document,
      location: root.location,
      fetch: root.fetch.bind(root),
      logger: root.console
    });
    root.document.addEventListener('page:loaded', () => {
      adapter.handlePageLoaded().catch(() => {});
    });
  }
})(typeof window === 'undefined' ? null : window, function() {
  const TIMEOUT_MS = 6000;

  class RequestError extends Error {
    constructor(code) {
      super(code);
      this.name = 'RequestError';
      this.code = code;
    }
  }

  const makeRequest = async (fetchImpl, url, options = {}, dependencies = {}) => {
    const Controller = dependencies.AbortController || AbortController;
    const setTimer = dependencies.setTimeout || setTimeout;
    const clearTimer = dependencies.clearTimeout || clearTimeout;
    const controller = new Controller();
    const timer = setTimer(() => controller.abort(), dependencies.timeoutMs ?? TIMEOUT_MS);
    try {
      let response;
      try {
        response = await fetchImpl(url, { ...options, signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) throw new RequestError('timeout');
        const reason = error && (error.code || error.name);
        throw new RequestError(typeof reason === 'string' ? reason : 'network_error');
      }
      if (!response || !response.ok) {
        throw new RequestError(`http_${response && Number.isInteger(response.status) ? response.status : 'error'}`);
      }
      let data;
      try {
        data = await response.json();
      } catch (_) {
        throw new RequestError('invalid_json');
      }
      if (!data || typeof data !== 'object') throw new RequestError('invalid_json');
      return data;
    } finally {
      clearTimer(timer);
    }
  };

  const createAdapter = ({
    config,
    document,
    location,
    fetch: fetchImpl,
    logger = null,
    timeoutMs = TIMEOUT_MS,
    setTimeout: setTimer = setTimeout,
    clearTimeout: clearTimer = clearTimeout,
    AbortController: Controller = AbortController
  }) => {
    let pageSequence = 0;
    let routerPromise = null;
    const options = { timeoutMs, setTimeout: setTimer, clearTimeout: clearTimer, AbortController: Controller };

    const visitors = () => [...document.querySelectorAll('.leancloud_visitors')];
    const hide = elements => elements.forEach(element => { element.hidden = true; });
    const setCount = (element, count, sequence) => {
      if (sequence !== pageSequence || !element.isConnected || !Number.isSafeInteger(count) || count < 0) return;
      element.title = '浏览次数（非独立访客）';
      const label = element.querySelector('.post-meta-item-text');
      const target = element.querySelector('.leancloud-visitors-count');
      if (!target) return;
      if (label) label.textContent = '浏览次数：';
      target.textContent = String(count);
      element.hidden = false;
    };
    const current = (sequence, element) => sequence === pageSequence && element.isConnected;
    const request = (url, method, body, headers) => makeRequest(fetchImpl, url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }, options);
    const resolveServer = () => {
      const { app_id: appId, server_url: serverUrl } = config.leancloud_visitors;
      if (serverUrl) return Promise.resolve(serverUrl.replace(/\/$/, ''));
      if (appId.slice(-9) === '-MdYXbMMI') return Promise.resolve(`https://${appId.slice(0, 8).toLowerCase()}.api.lncldglobal.com`);
      if (!routerPromise) {
        const route = `https://app-router.leancloud.cn/2/route?appId=${encodeURIComponent(appId)}`;
        routerPromise = request(route, 'GET').then(data => {
          if (typeof data.api_server !== 'string' || !data.api_server) throw new RequestError('route_missing_api_server');
          return `https://${data.api_server}`;
        }).catch(error => {
          routerPromise = null;
          throw error;
        });
      }
      return routerPromise;
    };
    const headers = () => {
      const { app_id: appId, app_key: appKey } = config.leancloud_visitors;
      return { 'X-LC-Id': appId, 'X-LC-Key': appKey, 'Content-Type': 'application/json' };
    };
    const logFailure = error => {
      if (logger && typeof logger.warn === 'function') logger.warn('LeanCloud statistics unavailable:', error && error.code ? error.code : 'request_error');
    };

    const handlePageLoaded = async () => {
      const sequence = ++pageSequence;
      const elements = visitors();
      hide(elements);
      if (location.hostname !== config.hostname) return;
      if (!config.leancloud_visitors || !config.leancloud_visitors.enable || !elements.length) return;
      try {
        const apiServer = await resolveServer();
        if (sequence !== pageSequence) return;
        const apiHeaders = headers();
        if (config.page && config.page.isPost) {
          const element = elements[0];
          if (!current(sequence, element)) return;
          const url = decodeURI(element.id);
          const title = element.dataset.flagTitle || '';
          const where = encodeURIComponent(JSON.stringify({ url }));
          const result = await request(`${apiServer}/1.1/classes/Counter?where=${where}`, 'GET', undefined, apiHeaders);
          if (!current(sequence, element)) return;
          if (!Array.isArray(result.results)) throw new RequestError('invalid_counter_response');
          if (result.results.length) {
            const counter = result.results[0];
            if (!counter || typeof counter.objectId !== 'string' || !counter.objectId || !Number.isSafeInteger(counter.time) || counter.time < 0) throw new RequestError('invalid_counter_record');
            await request(`${apiServer}/1.1/classes/Counter/${encodeURIComponent(counter.objectId)}`, 'PUT', {
              time: { __op: 'Increment', amount: 1 }
            }, apiHeaders);
            setCount(element, counter.time + 1, sequence);
          } else if (!config.leancloud_visitors.security) {
            await request(`${apiServer}/1.1/classes/Counter`, 'POST', { title, url, time: 1 }, apiHeaders);
            setCount(element, 1, sequence);
          }
          return;
        }
        if (!document.querySelectorAll('.post-title-link').length) return;
        const paths = elements.map(element => decodeURI(element.id));
        const where = encodeURIComponent(JSON.stringify({ url: { $in: paths } }));
        const result = await request(`${apiServer}/1.1/classes/Counter?where=${where}`, 'GET', undefined, apiHeaders);
        if (sequence !== pageSequence) return;
        if (!Array.isArray(result.results)) throw new RequestError('invalid_counter_response');
        for (const element of elements) {
          if (!current(sequence, element)) continue;
          const path = decodeURI(element.id);
          const counter = result.results.find(item => item && item.url === path);
          if (counter && Number.isSafeInteger(counter.time) && counter.time >= 0) setCount(element, counter.time, sequence);
          else element.hidden = true;
        }
      } catch (error) {
        if (sequence === pageSequence) hide(elements);
        logFailure(error);
      }
    };

    return { handlePageLoaded };
  };

  return { createAdapter, makeRequest, RequestError };
});
