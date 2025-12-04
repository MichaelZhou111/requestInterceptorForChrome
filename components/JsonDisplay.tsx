import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface JsonDisplayProps {
  data: any;
  name?: string;
  level?: number;
  isLast?: boolean;
}

const JsonDisplay: React.FC<JsonDisplayProps> = ({ data, name, level = 0, isLast = true }) => {
  const [isOpen, setIsOpen] = useState(true);
  const indent = level * 16; // pixels

  // Helper for key rendering
  const renderKey = () => (
    name ? <span className="text-purple-300 mr-1 opacity-90">{name}:</span> : null
  );

  // Null / Undefined
  if (data === null) {
    return (
      <div style={{ paddingLeft: `${indent}px` }} className="font-mono text-sm hover:bg-white/5 py-0.5 rounded">
        {renderKey()}
        <span className="text-gray-500 italic">null</span>
        {!isLast && <span className="text-gray-500">,</span>}
      </div>
    );
  }
  if (data === undefined) {
    return (
      <div style={{ paddingLeft: `${indent}px` }} className="font-mono text-sm hover:bg-white/5 py-0.5 rounded">
        {renderKey()}
        <span className="text-gray-600 italic">undefined</span>
        {!isLast && <span className="text-gray-500">,</span>}
      </div>
    );
  }

  // Primitives
  if (typeof data === 'boolean') {
    return (
      <div style={{ paddingLeft: `${indent}px` }} className="font-mono text-sm hover:bg-white/5 py-0.5 rounded">
        {renderKey()}
        <span className="text-yellow-400">{data.toString()}</span>
        {!isLast && <span className="text-gray-500">,</span>}
      </div>
    );
  }

  if (typeof data === 'number') {
    return (
      <div style={{ paddingLeft: `${indent}px` }} className="font-mono text-sm hover:bg-white/5 py-0.5 rounded">
        {renderKey()}
        <span className="text-blue-400">{data}</span>
        {!isLast && <span className="text-gray-500">,</span>}
      </div>
    );
  }

  if (typeof data === 'string') {
    const isDate = /^\d{4}-\d{2}-\d{2}T/.test(data);
    return (
      <div style={{ paddingLeft: `${indent}px` }} className="font-mono text-sm hover:bg-white/5 py-0.5 rounded flex flex-wrap">
        <div className="whitespace-nowrap">{renderKey()}</div>
        <span className={`${isDate ? 'text-yellow-300' : 'text-green-300'} break-all whitespace-pre-wrap`}>
          "{data}"
        </span>
        {!isLast && <span className="text-gray-500">,</span>}
      </div>
    );
  }

  // Arrays & Objects
  const isArray = Array.isArray(data);
  const keys = Object.keys(data);
  const isEmpty = keys.length === 0;
  
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';
  const itemCount = isArray ? data.length : keys.length;

  if (isEmpty) {
    return (
      <div style={{ paddingLeft: `${indent}px` }} className="font-mono text-sm hover:bg-white/5 py-0.5 rounded">
        {renderKey()}
        <span className="text-gray-400">{openBracket}{closeBracket}</span>
        {!isLast && <span className="text-gray-500">,</span>}
      </div>
    );
  }

  return (
    <div className="font-mono text-sm">
      <div 
        className="flex items-center hover:bg-white/5 py-0.5 rounded cursor-pointer select-none"
        style={{ paddingLeft: `${indent}px` }}
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
      >
        <span className="text-gray-500 mr-1 w-4 flex justify-center">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        {renderKey()}
        <span className="text-gray-400">{openBracket}</span>
        
        {!isOpen && (
           <span className="text-gray-600 text-xs mx-2 italic">
             {isArray ? `${itemCount} items` : `...`}
           </span>
        )}
        
        {!isOpen && (
            <span>
                <span className="text-gray-400">{closeBracket}</span>
                {!isLast && <span className="text-gray-500">,</span>}
            </span>
        )}
      </div>

      {isOpen && (
        <div>
          {keys.map((key, index) => {
             const val = data[key];
             const isLastItem = index === keys.length - 1;
             return (
               <JsonDisplay 
                 key={key} 
                 data={val} 
                 name={isArray ? undefined : key} 
                 level={level + 1}
                 isLast={isLastItem}
               />
             );
          })}
          <div style={{ paddingLeft: `${indent + 20}px` }} className="hover:bg-white/5 py-0.5 rounded">
             <span className="text-gray-400">{closeBracket}</span>
             {!isLast && <span className="text-gray-500">,</span>}
          </div>
        </div>
      )}
    </div>
  );
};

export default JsonDisplay;