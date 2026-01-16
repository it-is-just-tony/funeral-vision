import { useState, useEffect, useRef, useCallback } from 'react';
import type { StatusEvent } from '@funeral-vision/shared';

// Allow running without Vite env typing complaints
const API_BASE = (import.meta as any)?.env?.VITE_API_URL || '/api';

interface StatusLogProps {
  maxMessages?: number;
  autoScroll?: boolean;
  showTimestamp?: boolean;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getTypeIcon(type: StatusEvent['type']): string {
  switch (type) {
    case 'info': return 'ℹ️';
    case 'progress': return '⏳';
    case 'success': return '✅';
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'connected': return '🔗';
    default: return '•';
  }
}

function getTypeColor(type: StatusEvent['type']): string {
  switch (type) {
    case 'info': return 'text-blue-400';
    case 'progress': return 'text-yellow-400';
    case 'success': return 'text-green-400';
    case 'error': return 'text-red-400';
    case 'warning': return 'text-orange-400';
    case 'connected': return 'text-purple-400';
    default: return 'text-gray-400';
  }
}

export function StatusLog({ 
  maxMessages = 50, 
  autoScroll = true,
  showTimestamp = true 
}: StatusLogProps) {
  const [messages, setMessages] = useState<StatusEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE endpoint
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`${API_BASE}/wallet/status/events`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StatusEvent;
        
        setMessages(prev => {
          const newMessages = [...prev, data];
          // Keep only the last maxMessages
          if (newMessages.length > maxMessages) {
            return newMessages.slice(-maxMessages);
          }
          return newMessages;
        });
      } catch (e) {
        console.error('Failed to parse SSE message:', e);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
      // Reconnect after 3 seconds
      setTimeout(connect, 3000);
    };
  }, [maxMessages]);

  useEffect(() => {
    connect();
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const clearLog = () => {
    setMessages([]);
  };

  // Get latest progress message for the minimized view
  const latestProgress = messages
    .filter(m => m.type === 'progress')
    .slice(-1)[0];
  
  const latestMessage = messages[messages.length - 1];

  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-4 right-4 bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl cursor-pointer hover:border-gray-600 transition-colors max-w-sm"
        onClick={() => setIsMinimized(false)}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-300">
            {latestProgress ? (
              <>
                {latestProgress.wallet?.emoji} {latestProgress.progress?.percentage}%
              </>
            ) : latestMessage ? (
              <>
                {getTypeIcon(latestMessage.type)} {latestMessage.message.slice(0, 30)}...
              </>
            ) : (
              'Status Log'
            )}
          </span>
          <button className="text-gray-500 hover:text-white ml-auto">⬆️</button>
        </div>
        
        {latestProgress?.progress && (
          <div className="mt-2 bg-gray-700 rounded-full h-1.5 overflow-hidden">
            <div 
              className="h-full bg-yellow-500 transition-all duration-300"
              style={{ width: `${latestProgress.progress.percentage}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-gray-900 border border-gray-700 rounded-lg shadow-xl flex flex-col max-h-80">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800 rounded-t-lg">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-gray-200">Status Log</span>
          <span className="text-xs text-gray-500">({messages.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearLog}
            className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded hover:bg-gray-700"
            title="Clear log"
          >
            🗑️
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded hover:bg-gray-700"
            title="Minimize"
          >
            ⬇️
          </button>
        </div>
      </div>
      
      {/* Messages */}
      <div 
        ref={logRef}
        className="flex-1 overflow-y-auto p-2 space-y-1 text-sm"
      >
        {messages.length === 0 ? (
          <div className="text-gray-500 text-center py-4">
            Waiting for activity...
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex items-start gap-2 py-1 px-2 rounded hover:bg-gray-800/50 ${getTypeColor(msg.type)}`}
            >
              <span className="flex-shrink-0">{getTypeIcon(msg.type)}</span>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {msg.wallet && (
                    <span className="flex-shrink-0" title={msg.wallet.address}>
                      {msg.wallet.emoji}
                    </span>
                  )}
                  <span className="truncate">{msg.message}</span>
                </div>
                
                {/* Progress bar */}
                {msg.progress && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="h-full bg-yellow-500 transition-all duration-300"
                        style={{ width: `${msg.progress.percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {msg.progress.current}/{msg.progress.total}
                    </span>
                  </div>
                )}
              </div>
              
              {showTimestamp && (
                <span className="text-xs text-gray-600 flex-shrink-0">
                  {formatTime(msg.timestamp)}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer with latest progress */}
      {latestProgress?.progress && (
        <div className="px-3 py-2 border-t border-gray-700 bg-gray-800/50">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span className="flex items-center gap-1">
              {latestProgress.wallet?.emoji} {latestProgress.wallet?.name}
            </span>
            <span>{latestProgress.progress.percentage}%</span>
          </div>
          <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-yellow-500 to-green-500 transition-all duration-300"
              style={{ width: `${latestProgress.progress.percentage}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
