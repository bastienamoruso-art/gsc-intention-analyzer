// File d'attente pour limiter les analyses simultanées
// Évite la surcharge et protège les coûts API

interface QueueEntry {
  id: string;
  resolve: (value: void) => void;
  reject: (reason?: any) => void;
  timestamp: number;
}

class RequestQueue {
  private queue: QueueEntry[] = [];
  private processing: Set<string> = new Set();
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  async acquire(id: string): Promise<void> {
    // Si sous la limite, traiter immédiatement
    if (this.processing.size < this.maxConcurrent) {
      this.processing.add(id);
      return Promise.resolve();
    }

    // Sinon, mettre en file d'attente
    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        id,
        resolve,
        reject,
        timestamp: Date.now()
      });

      // Timeout après 5 minutes
      setTimeout(() => {
        const index = this.queue.findIndex(entry => entry.id === id);
        if (index !== -1) {
          const entry = this.queue.splice(index, 1)[0];
          entry.reject(new Error('Request timeout - trop d\'utilisateurs simultanés'));
        }
      }, 5 * 60 * 1000);
    });
  }

  release(id: string): void {
    this.processing.delete(id);
    this.processNext();
  }

  private processNext(): void {
    if (this.queue.length === 0) return;
    if (this.processing.size >= this.maxConcurrent) return;

    const entry = this.queue.shift();
    if (entry) {
      this.processing.add(entry.id);
      entry.resolve();
    }
  }

  getQueuePosition(id: string): number {
    const index = this.queue.findIndex(entry => entry.id === id);
    return index === -1 ? 0 : index + 1;
  }

  getQueueStats(): {
    processing: number;
    queued: number;
    available: number;
  } {
    return {
      processing: this.processing.size,
      queued: this.queue.length,
      available: Math.max(0, this.maxConcurrent - this.processing.size)
    };
  }
}

// Instance globale singleton
export const analysisQueue = new RequestQueue(15); // Max 15 analyses simultanées
