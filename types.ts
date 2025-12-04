// Minimal definitions for Chrome DevTools Network types

export interface Header {
  name: string;
  value: string;
}

export interface PostData {
  mimeType: string;
  text?: string;
  params?: { name: string; value: string }[];
}

export interface RequestEntry {
  method: string;
  url: string;
  httpVersion: string;
  headers: Header[];
  queryString: { name: string; value: string }[];
  postData?: PostData;
  bodySize: number;
}

export interface ResponseEntry {
  status: number;
  statusText: string;
  headers: Header[];
  content: {
    size: number;
    mimeType: string;
    text?: string; // Content is usually fetched async via getContent()
  };
}

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: RequestEntry;
  response: ResponseEntry;
  getContent?: (callback: (content: string, encoding: string) => void) => void;
  _resourceType?: string; // Chrome specific
}

export interface ParsedRequest {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  type: string;
  duration: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: any;
  responseBody: any;
  error?: string;
}
