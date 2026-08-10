package com.schuanhe.Plook.model;

public record PlaybackState(boolean playing, double currentTime, long updatedAt) {
    public static PlaybackState idle() {
        return new PlaybackState(false, 0d, 0L);
    }

    public PlaybackState snapshot(long now) {
        if (!playing) {
            return this;
        }
        return new PlaybackState(true, effectiveCurrentTime(now), now);
    }

    public double effectiveCurrentTime(long now) {
        if (!playing || updatedAt <= 0L) {
            return currentTime;
        }
        return Math.max(0d, currentTime + (now - updatedAt) / 1000d);
    }
}
