package com.schuanhe.Plook.model;

/**
 * 房间播放状态。除播放/暂停与进度外，额外记录倍率 {@code rate}，用于跨端同步。
 */
public record PlaybackState(boolean playing, double currentTime, double rate, long updatedAt) {

    public PlaybackState {
        if (rate <= 0 || Double.isNaN(rate) || Double.isInfinite(rate)) {
            rate = 1.0d;
        }
    }

    public static PlaybackState idle() {
        return new PlaybackState(false, 0d, 1.0d, 0L);
    }

    /**
     * 基于服务端当前时间推算真实进度：播放中时按倍率补偿已流逝的时间。
     */
    public PlaybackState snapshot(long now) {
        if (!playing) {
            return this;
        }
        return new PlaybackState(true, effectiveCurrentTime(now), rate, now);
    }

    public double effectiveCurrentTime(long now) {
        if (!playing || updatedAt <= 0L) {
            return currentTime;
        }
        return Math.max(0d, currentTime + (now - updatedAt) / 1000d * rate);
    }
}
