package com.schuanhe.Plook.model;

import java.util.List;

public record RoomSnapshot(
        String roomId,
        String roomName,
        String ownerId,
        boolean owner,
        boolean sourceLocked,
        boolean hidden,
        boolean hasPassword,
        List<String> members,
        VideoSourceState videoSource,
        PlaybackState playback,
        Long emptySince,
        long createdAt
) {
}
