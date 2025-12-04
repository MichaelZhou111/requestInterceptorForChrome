(function() {
  const XHR = XMLHttpRequest.prototype;
  const open = XHR.open;
  const send = XHR.send;
  const setRequestHeader = XHR.setRequestHeader;
  const originalFetch = window.fetch;

  // Helper to broadcast data
  const broadcast = (data) => {
    window.postMessage({
      source: 'ajax-interceptor',
      payload: data
    }, '*');
  };

  const safeJsonParse = (str) => {
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  };

  // Helper to parse XHR headers string into object
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

  // --- Intercept XMLHttpRequest ---
  
  XHR.open = function(method, url) {
    this._method = method;
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
    
    this.addEventListener('load', function() {
      // Avoid breaking if responseType is not text compatible
      let responseBody = null;
      if (!this.responseType || this.responseType === 'text') {
        responseBody = safeJsonParse(this.responseText);
      }
      
      const responseHeaders = parseHeaders(this.getAllResponseHeaders());

      broadcast({
        id,
        timestamp: new Date().toLocaleTimeString(),
        method: this._method,
        url: this._url,
        status: this.status,
        type: 'xhr',
        requestHeaders: this._requestHeaders,
        responseHeaders: responseHeaders,
        requestBody: safeJsonParse(postData) || postData,
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
    let requestBody = null;
    let url = '';
    let reqHeaders = {};

    if (typeof resource === 'string') {
        url = resource;
    } else if (resource instanceof Request) {
        url = resource.url;
        method = resource.method; 
    }

    if (config) {
        if (config.method) method = config.method;
        if (config.body) {
            requestBody = safeJsonParse(config.body) || config.body;
        }
        if (config.headers) {
            if (config.headers instanceof Headers) {
                config.headers.forEach((v, k) => reqHeaders[k] = v);
            } else {
                reqHeaders = config.headers;
            }
        }
    }

    try {
        const response = await originalFetch(...args);
        
        const clone = response.clone();
        
        // Capture Response Headers
        const resHeaders = {};
        response.headers.forEach((val, key) => {
            resHeaders[key] = val;
        });
        
        clone.text().then(text => {
            const duration = Date.now() - startTime;
            broadcast({
                id,
                timestamp: new Date().toLocaleTimeString(),
                method: method.toUpperCase(),
                url: url,
                status: response.status,
                type: 'fetch',
                requestHeaders: reqHeaders,
                responseHeaders: resHeaders,
                requestBody: requestBody,
                responseBody: safeJsonParse(text),
                duration
            });
        }).catch(err => {
            // Cloning or reading failed
        });

        return response;
    } catch (err) {
        return Promise.reject(err);
    }
  };

  // --- Replay Logic ---
  window.addEventListener('message', async (event) => {
      if (event.source !== window || !event.data || event.data.source !== 'extension-replay') {
          return;
      }

      const { url, method, headers, body } = event.data.payload;

      console.log('[Ajax Interceptor] Replaying:', method, url);

      // Filter out unsafe headers that browser forbids setting manually
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

      const fetchOptions = {
          method: method,
          headers: cleanHeaders, 
          credentials: 'include', // CRITICAL: Include cookies to pass auth
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