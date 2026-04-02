export interface ConnectionStatus {
  isOnline: boolean;
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  latency: number | null;
  lastCheck: Date;
  error?: string;
}

export interface ConnectionMonitorOptions {
  serverUrl: string;
  pingInterval?: number; // milliseconds
  timeout?: number; // milliseconds
  onStatusChange?: (status: ConnectionStatus) => void;
}

export class ConnectionMonitor {
  private serverUrl: string;
  private pingInterval: number;
  private timeout: number;
  private onStatusChange?: (status: ConnectionStatus) => void;
  private intervalId: NodeJS.Timeout | null = null;
  private currentStatus: ConnectionStatus;
  private isRunning: boolean = false;

  constructor(options: ConnectionMonitorOptions) {
    this.serverUrl = options.serverUrl;
    this.pingInterval = options.pingInterval || 30000; // 30 seconds default
    this.timeout = options.timeout || 5000; // 5 seconds default
    this.onStatusChange = options.onStatusChange;

    this.currentStatus = {
      isOnline: false,
      quality: 'unknown',
      latency: null,
      lastCheck: new Date()
    };
  }

  /**
   * Start monitoring connection
   */
  start(): void {
    if (this.isRunning) {
      console.warn('Connection monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting connection monitor...');

    // Initial check
    this.checkConnection();

    // Periodic checks
    this.intervalId = setInterval(() => {
      this.checkConnection();
    }, this.pingInterval);
  }

  /**
   * Stop monitoring connection
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log('Stopping connection monitor...');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check connection status
   */
  private async checkConnection(): Promise<void> {
    const startTime = Date.now();
    let isOnline = false;
    let error: string | undefined;

    try {
      // Try to fetch a small resource from server
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.serverUrl}/api/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      clearTimeout(timeoutId);

      isOnline = response.ok;

      if (!isOnline) {
        error = `Server responded with status ${response.status}`;
      }
    } catch (err) {
      isOnline = false;
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    const latency = Date.now() - startTime;
    const quality = this.calculateQuality(latency);

    const newStatus: ConnectionStatus = {
      isOnline,
      quality,
      latency: isOnline ? latency : null,
      lastCheck: new Date(),
      error: isOnline ? undefined : error
    };

    // Only notify if status changed
    if (this.statusChanged(this.currentStatus, newStatus)) {
      this.currentStatus = newStatus;
      console.log('Connection status changed:', newStatus);
      this.onStatusChange?.(newStatus);
    } else {
      // Update last check time even if status didn't change
      this.currentStatus.lastCheck = newStatus.lastCheck;
      this.currentStatus.latency = newStatus.latency;
      this.currentStatus.quality = newStatus.quality;
    }
  }

  /**
   * Calculate connection quality based on latency
   */
  private calculateQuality(latency: number): 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' {
    if (latency < 100) return 'excellent';
    if (latency < 200) return 'good';
    if (latency < 500) return 'fair';
    if (latency < 1000) return 'poor';
    return 'unknown';
  }

  /**
   * Check if connection status changed
   */
  private statusChanged(oldStatus: ConnectionStatus, newStatus: ConnectionStatus): boolean {
    return (
      oldStatus.isOnline !== newStatus.isOnline ||
      oldStatus.quality !== newStatus.quality ||
      (oldQualityDegraded(oldStatus.quality, newStatus.quality))
    );
  }

  /**
   * Get current status
   */
  getStatus(): ConnectionStatus {
    return { ...this.currentStatus };
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.currentStatus.isOnline;
  }

  /**
   * Get last check time
   */
  getLastCheck(): Date {
    return this.currentStatus.lastCheck;
  }

  /**
   * Get connection quality
   */
  getQuality(): 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' {
    return this.currentStatus.quality;
  }

  /**
   * Manually trigger a connection check
   */
  async checkNow(): Promise<ConnectionStatus> {
    await this.checkConnection();
    return this.getStatus();
  }
}

/**
 * Helper to check if quality degraded
 */
function oldQualityDegraded(oldQuality: string, newQuality: string): boolean {
  const qualityOrder = ['excellent', 'good', 'fair', 'poor', 'unknown'];
  const oldIndex = qualityOrder.indexOf(oldQuality);
  const newIndex = qualityOrder.indexOf(newQuality);
  return newIndex > oldIndex;
}
