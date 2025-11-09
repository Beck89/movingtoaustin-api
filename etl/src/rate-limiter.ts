/**
 * Centralized rate limiter for MLS Grid API
 * 
 * MLS Grid enforces:
 * - 2 requests per second (RPS)
 * - 7,200 requests per hour
 * - 40,000 requests per day
 * 
 * This module tracks ALL requests to MLS Grid (API calls + media downloads)
 * to ensure we stay within limits.
 */

export class RateLimiter {
    private requestCount = 0;
    private hourlyStartTime = Date.now();
    private readonly maxRequestsPerHour = 7000; // Leave 200 buffer
    private readonly minDelayMs = 600; // Minimum 600ms between requests (conservative, ~1.6 RPS)

    /**
     * Wait if necessary to respect rate limits, then increment counter
     */
    async waitForSlot(): Promise<void> {
        // Check hourly limit
        const elapsed = Date.now() - this.hourlyStartTime;
        if (this.requestCount >= this.maxRequestsPerHour) {
            if (elapsed < 3600000) { // Less than 1 hour
                const waitTime = 3600000 - elapsed;
                console.log(`⏳ Rate limit: ${this.requestCount} requests in ${Math.round(elapsed / 60000)}min. Waiting ${Math.round(waitTime / 60000)}min...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                this.reset();
            } else {
                // Hour has passed, reset counter
                this.reset();
            }
        }

        // Enforce minimum delay between requests (max 2 RPS)
        await new Promise(resolve => setTimeout(resolve, this.minDelayMs));

        // Increment counter
        this.requestCount++;
    }

    /**
     * Reset the hourly counter
     */
    private reset(): void {
        this.requestCount = 0;
        this.hourlyStartTime = Date.now();
    }

    /**
     * Get current stats
     */
    getStats(): { requestCount: number; elapsedMinutes: number } {
        const elapsed = Date.now() - this.hourlyStartTime;
        return {
            requestCount: this.requestCount,
            elapsedMinutes: Math.round(elapsed / 60000),
        };
    }
}

// Singleton instance shared across all modules
export const rateLimiter = new RateLimiter();