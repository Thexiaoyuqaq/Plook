package com.schuanhe.Plook.model;

/**
 * 房间历史记录条目。{@code kind} 为 {@code "chat"} 或 {@code "system"}。
 * 每个活跃房间在内存中最多保留 50 条，供后加入/重连的成员回看上下文。
 */
public record ChatLogEntry(String id, String kind, String ownerId, String text, long sentAt) {
}
