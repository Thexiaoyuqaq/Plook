package com.schuanhe.Plook.model;

public record RoomSummary(
        String roomId,
        String roomName,
        String ownerId,
        int memberCount,
        boolean sourceLocked,
        boolean hidden,
        boolean hasPassword,
        Long emptySince,
        long createdAt
) {
}
