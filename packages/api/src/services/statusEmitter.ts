import { EventEmitter } from 'events';

export interface StatusEvent {
  id: string;
  type: 'info' | 'progress' | 'success' | 'error' | 'warning';
  message: string;
  timestamp: number;
  wallet?: {
    address: string;
    name: string;
    emoji: string;
  };
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  details?: Record<string, unknown>;
}

class StatusEmitter extends EventEmitter {
  private messageId = 0;

  emit(event: 'status', status: Omit<StatusEvent, 'id' | 'timestamp'>): boolean {
    const fullEvent: StatusEvent = {
      ...status,
      id: `${Date.now()}-${++this.messageId}`,
      timestamp: Date.now(),
    };
    return super.emit('status', fullEvent);
  }

  info(message: string, wallet?: StatusEvent['wallet'], details?: Record<string, unknown>) {
    this.emit('status', { type: 'info', message, wallet, details });
  }

  progress(
    message: string,
    current: number,
    total: number,
    wallet?: StatusEvent['wallet']
  ) {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    this.emit('status', {
      type: 'progress',
      message,
      wallet,
      progress: { current, total, percentage },
    });
  }

  success(message: string, wallet?: StatusEvent['wallet'], details?: Record<string, unknown>) {
    this.emit('status', { type: 'success', message, wallet, details });
  }

  error(message: string, wallet?: StatusEvent['wallet'], details?: Record<string, unknown>) {
    this.emit('status', { type: 'error', message, wallet, details });
  }

  warning(message: string, wallet?: StatusEvent['wallet'], details?: Record<string, unknown>) {
    this.emit('status', { type: 'warning', message, wallet, details });
  }
}

// Singleton instance
export const statusEmitter = new StatusEmitter();
