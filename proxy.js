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

      broadcast({
        id,
        timestamp: new Date().toLocaleTimeString(),
        method: this._method,
        url: this._url,
        status: this.status,
        type: 'xhr',
        requestHeaders: this._requestHeaders,
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
        // Cannot easily read Request body here without consuming it
    }

    if (config) {
        if (config.method) method = config.method;
        if (config.body) {
            requestBody = safeJsonParse(config.body) || config.body;
        }
        if (config.headers) {
            // Normalize headers
            if (config.headers instanceof Headers) {
                config.headers.forEach((v, k) => reqHeaders[k] = v);
            } else {
                reqHeaders = config.headers;
            }
        }
    }

    try {
        const response = await originalFetch(...args);
        
        // We need to clone the response to read it without consuming the stream for the actual app
        const clone = response.clone();
        
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

      const fetchOptions = {
          method: method,
          headers: { ...headers }, // Copy caught headers
      };

      // Ensure content-type exists if we are sending JSON
      if (body) {
        fetchOptions.body = body; // It's already stringified JSON or plain text
        // If it looks like JSON and no content type is set, add it
        if (!fetchOptions.headers['Content-Type'] && !fetchOptions.headers['content-type']) {
            try {
                JSON.parse(body);
                fetchOptions.headers['Content-Type'] = 'application/json';
            } catch(e) {}
        }
      }

      try {
          await window.fetch(url, fetchOptions);
          // The normal fetch interceptor above will catch this and send it to the UI
      } catch (e) {
          console.error('[Ajax Interceptor] Replay failed:', e);
      }
  });

})();