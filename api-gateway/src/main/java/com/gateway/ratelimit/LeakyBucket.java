package com.gateway.ratelimit;

import java.time.Instant;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Leaky Bucket Algorithm
 *
 * Requests fill a bucket. The bucket leaks at a fixed rate.
 * If the bucket overflows (exceeds capacity) → reject request.
 *
 * Unlike Token Bucket, this enforces a smooth, steady output rate.
 * No bursting allowed — excess requests are dropped immediately.
 */
public class LeakyBucket {

    private final int capacity;
    private final int leakRatePerSecond;
    private double currentLevel;
    private Instant lastLeakTime;
    private final ReentrantLock lock = new ReentrantLock();

    public LeakyBucket(int capacity, int leakRatePerSecond) {
        this.capacity = capacity;
        this.leakRatePerSecond = leakRatePerSecond;
        this.currentLevel = 0;
        this.lastLeakTime = Instant.now();
    }

    /**
     * Attempt to add a request to the bucket.
     * @return true if accepted, false if bucket is full (rate limited).
     */
    public boolean tryConsume() {
        lock.lock();
        try {
            leak();
            if (currentLevel < capacity) {
                currentLevel++;
                return true;
            }
            return false;
        } finally {
            lock.unlock();
        }
    }

    private void leak() {
        Instant now = Instant.now();
        double elapsedSeconds = (now.toEpochMilli() - lastLeakTime.toEpochMilli()) / 1000.0;

        if (elapsedSeconds > 0) {
            double leaked = elapsedSeconds * leakRatePerSecond;
            currentLevel = Math.max(0, currentLevel - leaked);
            lastLeakTime = now;
        }
    }

    public double getCurrentLevel() {
        lock.lock();
        try {
            leak();
            return currentLevel;
        } finally {
            lock.unlock();
        }
    }

    public int getCapacity() { return capacity; }
    public int getLeakRate() { return leakRatePerSecond; }
}
