import React, { useEffect, useState } from 'react';
import { ParsedRequest } from './types';
import { formatUrl, getStatusColor, getMethodColor } from './utils';
import JsonDisplay from './components/JsonDisplay';
import { Trash2, Search, Activity, WifiOff, Globe, Database, ArrowRightLeft, Copy, Check, PlayCircle, Filter } from 'lucide-react';

declare const chrome: any;

const App: React.FC = () => {
  const [requests, setRequests] = useState<ParsedRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [isCapturing, setIsCapturing] = useState(true);
  const [preserveLog, setPreserveLog] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  
  // Tab Management
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  useEffect(() => {
    // 1. Get initial active tab
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
            if (tabs && tabs.length > 0) {
                setActiveTabId(tabs[0].id);
            }
        });

        // 2. Listen for tab switches
        const tabListener = (activeInfo: any) => {
            setActiveTabId(activeInfo.tabId);
            // Clear list when switching tabs if not preserving log
            if (!preserveLog) {
                setRequests([]);
                setSelectedId(null);
            }
        };
        chrome.tabs.onActivated.addListener(tabListener);

        // 3. Listen for page navigation/refresh
        const navListener = (details: any) => {
            if (details.frameId === 0 && details.tabId === activeTabId && !preserveLog) {
                 // The active tab navigated to a new URL, clear logs
                 setRequests([]);
                 setSelectedId(null);
            }
        };
        // onCommitted is a good place to detect navigation
        if (chrome.webNavigation) {
            chrome.webNavigation.onCommitted.addListener(navListener);
        }

        return () => {
            chrome.tabs.onActivated.removeListener(tabListener);
            if (chrome.webNavigation) {
                chrome.webNavigation.onCommitted.removeListener(navListener);
            }
        };
    }
  }, [preserveLog, activeTabId]);


  useEffect(() => {
    // Listen for messages from content script
    const messageListener = (message: any, sender: any) => {
        if (!isCapturing) return;
        if (!message || !message.url) return;

        // Filter: Only show requests from the currently active tab in the Side Panel
        if (activeTabId && sender.tab && sender.tab.id !== activeTabId) {
            return; 
        }

        const newRequest: ParsedRequest = {
            id: message.id || crypto.randomUUID(),
            timestamp: message.timestamp,
            method: message.method,
            url: message.url,
            status: message.status,
            type: message.type || 'xhr',
            duration: message.duration || 0,
            requestHeaders: {},
            responseHeaders: {},
            requestBody: message.requestBody,
            responseBody: message.responseBody
        };

        setRequests(prev => {
            const updated = [newRequest, ...prev];
            return updated.slice(0, 200);
        });
    };

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener(messageListener);
    }

    return () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.removeListener(messageListener);
        }
    };
  }, [isCapturing, activeTabId]);

  const filteredRequests = requests.filter(r => 
    r.url.toLowerCase().includes(filter.toLowerCase()) || 
    r.method.toLowerCase().includes(filter.toLowerCase())
  );

  const selectedRequest = requests.find(r => r.id === selectedId);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-900 text-gray-200 font-sans text-sm">
      
      {/* Top Bar - Request List Controls */}
      <div className="flex-none p-2 border-b border-gray-800 bg-gray-900 z-10">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-100 mr-2">Ajax Interceptor</span>
                    <button 
                        onClick={() => setIsCapturing(!isCapturing)} 
                        className={`p-1.5 rounded hover:bg-gray-800 transition-colors ${!isCapturing ? 'text-gray-500' : 'text-red-400'}`}
                        title={isCapturing ? "Stop recording" : "Start recording"}
                    >
                        {isCapturing ? <Activity size={16} /> : <PlayCircle size={16} />}
                    </button>
                    <button 
                        onClick={() => { setRequests([]); setSelectedId(null); }} 
                        className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
                        title="Clear log"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-400 select-none">
                    <input 
                        type="checkbox" 
                        checked={preserveLog}
                        onChange={(e) => setPreserveLog(e.target.checked)}
                        className="rounded border-gray-700 bg-gray-800" 
                    />
                    <span>Preserve</span>
                </label>
            </div>
            
            <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-500" />
                <input 
                    type="text" 
                    placeholder="Filter URLs..." 
                    className="w-full bg-gray-800 text-xs py-1.5 pl-8 pr-3 rounded border border-gray-700 focus:outline-none focus:border-blue-600 transition-colors placeholder-gray-600"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
            </div>
      </div>

      {/* Split View Content */}
      <div className="flex-1 flex overflow-hidden">
          
          {/* List Panel */}
          <div className={`${selectedRequest ? 'hidden md:flex md:w-1/3' : 'flex w-full'} flex-col border-r border-gray-800 bg-gray-900 overflow-y-auto custom-scrollbar`}>
            {filteredRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-60 text-gray-600 px-6 text-center">
                    {filter ? (
                         <p>No matches found</p>
                    ) : (
                        <>
                            <WifiOff size={32} className="mb-3 opacity-20" />
                            <p className="mb-1">Waiting for network activity...</p>
                            <p className="text-xs text-gray-700">Requests from current tab will appear here.</p>
                        </>
                    )}
                </div>
            ) : (
                <div className="flex flex-col w-full">
                    {filteredRequests.map((req) => (
                        <div 
                            key={req.id}
                            onClick={() => setSelectedId(req.id)}
                            className={`
                                group flex flex-col p-3 border-b border-gray-800 cursor-pointer text-xs
                                ${selectedId === req.id ? 'bg-blue-900/20 border-l-2 border-l-blue-500' : 'hover:bg-gray-800/50 border-l-2 border-l-transparent'}
                            `}
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${getMethodColor(req.method)}`}>
                                    {req.method}
                                </span>
                                <span className={`font-mono ${getStatusColor(req.status)}`}>
                                    {req.status || '...'}
                                </span>
                            </div>
                            <div className={`truncate font-mono mb-1 ${selectedId === req.id ? 'text-gray-200' : 'text-gray-400 group-hover:text-gray-300'}`} title={req.url}>
                                {req.url.split('/').pop() || req.url}
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-600">
                                <span className="truncate max-w-[70%]" title={req.url}>{formatUrl(req.url)}</span>
                                <span>{req.timestamp}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>

          {/* Details Panel */}
          {selectedRequest ? (
            <div className="flex-1 flex flex-col bg-[#0d1117] overflow-hidden w-full md:w-2/3 absolute md:relative inset-0 md:inset-auto z-20 md:z-auto">
                {/* Detail Header / Mobile Back Button */}
                <div className="px-3 py-2 border-b border-gray-800 bg-gray-900 flex items-center gap-2">
                     <button 
                        onClick={() => setSelectedId(null)}
                        className="md:hidden p-1 hover:bg-gray-800 rounded text-gray-400"
                     >
                        <ArrowRightLeft size={16} />
                     </button>
                     <div className="flex-1 min-w-0">
                         <div className="font-semibold text-gray-200 truncate text-xs" title={selectedRequest.url}>
                             {selectedRequest.url}
                         </div>
                     </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    
                    {/* Payload */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Globe size={12} className="text-blue-400" />
                                Payload
                            </h3>
                            {selectedRequest.requestBody && (
                                <button 
                                    onClick={() => copyToClipboard(JSON.stringify(selectedRequest.requestBody, null, 2), 'req')}
                                    className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-blue-400 transition-colors"
                                >
                                    {copied === 'req' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                </button>
                            )}
                        </div>
                        <div className="bg-[#161b22] p-3 rounded border border-gray-800 overflow-x-auto text-xs">
                            {!selectedRequest.requestBody ? (
                                <span className="text-gray-600 italic">No JSON payload</span>
                            ) : (
                                <JsonDisplay data={selectedRequest.requestBody} />
                            )}
                        </div>
                    </div>

                    {/* Response */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Database size={12} className="text-green-400" />
                                Response
                            </h3>
                            {selectedRequest.responseBody && (
                                <button 
                                    onClick={() => copyToClipboard(JSON.stringify(selectedRequest.responseBody, null, 2), 'res')}
                                    className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-green-400 transition-colors"
                                >
                                    {copied === 'res' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                </button>
                            )}
                        </div>
                        <div className="bg-[#161b22] p-3 rounded border border-gray-800 overflow-x-auto text-xs min-h-[100px]">
                            {!selectedRequest.responseBody ? (
                                <span className="text-gray-600 italic">No JSON response / Parse failed</span>
                            ) : (
                                <JsonDisplay data={selectedRequest.responseBody} />
                            )}
                        </div>
                    </div>
                </div>
            </div>
          ) : (
            <div className="hidden md:flex flex-1 flex-col items-center justify-center text-gray-700 bg-[#0d1117]">
                <Filter size={48} className="mb-4 opacity-20" />
                <p>Select a request to view details</p>
            </div>
          )}
      </div>
    </div>
  );
};

export default App;