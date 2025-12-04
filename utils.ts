export const safeJsonParse = (str: string | undefined): any => {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch (e) {
    return str; // Return raw string if not JSON
  }
};

export const formatUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch (e) {
    return url;
  }
};

export const getStatusColor = (status: number): string => {
  if (status >= 200 && status < 300) return "text-green-400";
  if (status >= 300 && status < 400) return "text-yellow-400";
  if (status >= 400 && status < 500) return "text-orange-400";
  if (status >= 500) return "text-red-500";
  return "text-gray-400";
};

export const getMethodColor = (method: string): string => {
  switch (method.toUpperCase()) {
    case 'GET': return 'text-blue-400 bg-blue-900/30 border-blue-800';
    case 'POST': return 'text-green-400 bg-green-900/30 border-green-800';
    case 'PUT': return 'text-orange-400 bg-orange-900/30 border-orange-800';
    case 'DELETE': return 'text-red-400 bg-red-900/30 border-red-800';
    default: return 'text-gray-400 bg-gray-800 border-gray-700';
  }
};
