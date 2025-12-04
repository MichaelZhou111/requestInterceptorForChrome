(function() {
  const XHR = XMLHttpRequest.prototype;
  const open = XHR.open;
  const send = XHR.send;
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
    return open.apply(this, arguments);
  };

  XHR.send = function(postData) {
    const id = Math.random().toString(36).substr(2, 9);
    
    this.addEventListener('load', function() {
      const responseData = this.responseType === '' || this.responseType === 'text' ? this.responseText : null;
      
      broadcast({
        id,
        timestamp: new Date().toLocaleTimeString(),
        method: this._method,
        url: this._url,
        status: this.status,
        type: 'xhr',
        requestBody: safeJsonParse(postData) || postData,
        responseBody: safeJsonParse(responseData),
        duration: 0 // XHR timing is harder to track precisely without perf observers, simplified here
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
})();
