
(function() {
  const XHR = XMLHttpRequest.prototype;
  const open = XHR.open;
  const send = XHR.send;
  const setRequestHeader = XHR.setRequestHeader;
  const originalFetch = window.fetch;

  // --- Helpers ---

  const broadcast = (data) => {
    try {
        // Try posting directly (works for simple objects, strings, numbers)
        window.postMessage({
            source: 'ajax-interceptor',
            payload: data
        }, '*');
    } catch (e) {
        // Fallback: If data contains non-clonable objects (like functions or complex prototypes),
        // serialize to JSON first.
        try {
            const safeData = JSON.parse(JSON.stringify(data, (key, value) => {
                if (value instanceof Blob) return '[Blob]';
                if (value instanceof File) return '[File]';
                if (typeof value === 'bigint') return value.toString();
                return value;
            }));
            window.postMessage({
                source: 'ajax-interceptor',
                payload: safeData
            }, '*');
        } catch(err) {
            console.error('[Ajax Interceptor] Failed to broadcast request', err);
        }
    }
  };

  const safeJsonParse = (str) => {
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  };

  const parseHeaders = (headerStr) => {
      const headers = {};
      if (!headerStr) return headers;
      const arr = headerStr.trim().split(/[\r\n]+/);
      arr.forEach(line => {
          const parts = line.split(': ');
          const header = parts.shift();
          const value = parts.join(': ');
          if (header) headers[header] = value;
      });
      return headers;
  };

  // Smart Payload Parser
  const parsePayload = (data) => {
      if (data === undefined || data === null) return null;
      
      if (typeof data === 'string') {
           try {
               return JSON.parse(data);
           } catch(e) {
               return data;
           }
      }
      if (data instanceof FormData) {
          const obj = {};
          data.forEach((value, key) => {
              // Handle multiple values for same key
              if (obj.hasOwnProperty(key)) {
                  if (!Array.isArray(obj[key])) {
                      obj[key] = [obj[key]];
                  }
                  obj[key].push(value);
              } else {
                  obj[key] = value;
              }
          });
          return obj;
      }
      if (data instanceof URLSearchParams) {
          const obj = {};
          data.forEach((value, key) => obj[key] = value);
          return obj;
      }
      if (data instanceof Blob || data instanceof File) {
          return '[Binary Data]';
      }
      if (data instanceof ArrayBuffer) {
          return '[ArrayBuffer]';
      }
      return data; // Return object as-is
  };

  // --- Intercept XMLHttpRequest ---
  
  XHR.open = function(method, url) {
    this._method = method ? method.toUpperCase() : 'GET';
    this._url = url;
    this._requestHeaders = {};
    return open.apply(this, arguments);
  };

  XHR.setRequestHeader = function(header, value) {
    if (!this._requestHeaders) this._requestHeaders = {};
    this._requestHeaders[header] = value;
    return setRequestHeader.apply(this, arguments);
  };

  XHR.send = function(postData) {
    const id = Math.random().toString(36).substr(2, 9);
    
    this.addEventListener('loadend', function() {
      let responseBody = null;
      // Accessing responseText can fail if responseType is 'blob' or 'arraybuffer'
      try {
          if (!this.responseType || this.responseType === 'text') {
            responseBody = safeJsonParse(this.responseText);
          } else {
            responseBody = `[${this.responseType} data]`;
          }
      } catch(e) {
          responseBody = null;
      }
      
      const responseHeaders = parseHeaders(this.getAllResponseHeaders());

      broadcast({
        id,
        timestamp: new Date().toLocaleTimeString(),
        method: this._method,
        url: this._url,
        status: this.status,
        type: 'xhr',
        isReplay: false,
        requestHeaders: this._requestHeaders,
        responseHeaders: responseHeaders,
        requestBody: parsePayload(postData),
        responseBody: responseBody,
        duration: 0 
      });
    });

    return send.apply(this, arguments);
  };

  // --- Intercept Fetch ---
  window.fetch = async (...args) => {
    const startTime = Date.now();
    const id = Math.random().toString(36).substr(2, 9);
    
    let [resource, config] = args;
    
    let method = 'GET';
    let url = '';
    let reqHeaders = {};
    let isReplay = false;
    
    // We need to capture the body. It might be in 'config.body' OR inside the 'resource' Request object.
    let requestBodyPromise = Promise.resolve(null);

    // 1. Handle URL and Method
    if (typeof resource === 'string') {
        url = resource;
        if (config && config.method) method = config.method;
    } else if (resource instanceof Request) {
        url = resource.url;
        method = resource.method;
    }

    // 2. Handle Headers & Replay Flag
    const extractHeaders = (headers) => {
        const h = {};
        if (headers instanceof Headers) {
            headers.forEach((v, k) => h[k] = v);
            if (headers.has('X-Extension-Replay')) {
                isReplay = true;
                headers.delete('X-Extension-Replay');
            }
        } else if (headers && typeof headers === 'object') {
            Object.keys(headers).forEach(k => {
                if (k.toLowerCase() === 'x-extension-replay') {
                    isReplay = true;
                    delete headers[k];
                } else {
                    h[k] = headers[k];
                }
            });
        }
        return h;
    };

    if (config && config.headers) {
        reqHeaders = extractHeaders(config.headers);
    } else if (resource instanceof Request && resource.headers) {
        reqHeaders = extractHeaders(resource.headers);
    }

    // 3. Handle Body (The Tricky Part)
    if (config && config.body) {
        // Case A: Body is in the config object (Standard)
        requestBodyPromise = Promise.resolve(parsePayload(config.body));
    } else if (resource instanceof Request) {
        // Case B: Body is inside the Request object. 
        // We must CLONE it to read it, otherwise the browser throws "Body is unusable" error.
        // Only try to read if method is not GET/HEAD.
        if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
            try {
                const reqClone = resource.clone();
                requestBodyPromise = reqClone.text().then(text => parsePayload(text)).catch(() => null);
            } catch (e) {
                // Cloning might fail if the body is already used/locked, though unlikely in a fresh fetch interceptor
                console.warn('[Ajax Interceptor] Failed to clone request', e);
            }
        }
    }

    try {
        // Execute the request first
        const response = await originalFetch(resource, config);
        const clone = response.clone();
        
        // Capture Response Headers
        const resHeaders = {};
        response.headers.forEach((val, key) => {
            resHeaders[key] = val;
        });
        
        // Resolve body and response text in parallel-ish
        Promise.all([
            requestBodyPromise,
            clone.text().catch(() => null)
        ]).then(([reqBody, resText]) => {
            const duration = Date.now() - startTime;
            broadcast({
                id,
                timestamp: new Date().toLocaleTimeString(),
                method: method.toUpperCase(),
                url: url,
                status: response.status,
                type: 'fetch',
                isReplay: isReplay,
                requestHeaders: reqHeaders,
                responseHeaders: resHeaders,
                requestBody: reqBody,
                responseBody: safeJsonParse(resText) || resText,
                duration
            });
        });

        return response;
    } catch (err) {
        // Handle Network Error
        const duration = Date.now() - startTime;
        requestBodyPromise.then(reqBody => {
            broadcast({
                id,
                timestamp: new Date().toLocaleTimeString(),
                method: method.toUpperCase(),
                url: url,
                status: 0,
                type: 'fetch',
                isReplay: isReplay,
                requestHeaders: reqHeaders,
                responseHeaders: {},
                requestBody: reqBody,
                responseBody: { error: err.message },
                duration
            });
        });
        throw err;
    }
  };

  // --- Replay Logic ---
  window.addEventListener('message', async (event) => {
      if (event.source !== window || !event.data || event.data.source !== 'extension-replay') {
          return;
      }

      const { url, method, headers, body } = event.data.payload;

      console.log('[Ajax Interceptor] Replaying:', method, url);

      const unsafeHeaders = [
          'accept-charset', 'accept-encoding', 'access-control-request-headers',
          'access-control-request-method', 'connection', 'content-length',
          'cookie', 'cookie2', 'date', 'dnt', 'expect', 'host', 'keep-alive',
          'origin', 'referer', 'te', 'trailer', 'transfer-encoding', 
          'upgrade', 'via'
      ];

      const cleanHeaders = {};
      if (headers) {
          Object.keys(headers).forEach(key => {
              if (!unsafeHeaders.includes(key.toLowerCase())) {
                  cleanHeaders[key] = headers[key];
              }
          });
      }

      cleanHeaders['X-Extension-Replay'] = 'true';

      const fetchOptions = {
          method: method,
          headers: cleanHeaders, 
          credentials: 'include',
      };

      if (body) {
        fetchOptions.body = body;
        const hasContentType = Object.keys(cleanHeaders).some(k => k.toLowerCase() === 'content-type');
        if (!hasContentType) {
            try {
                JSON.parse(body);
                fetchOptions.headers['Content-Type'] = 'application/json';
            } catch(e) {}
        }
      }

      try {
          await window.fetch(url, fetchOptions);
      } catch (e) {
          console.error('[Ajax Interceptor] Replay failed:', e);
      }
  });

})();
