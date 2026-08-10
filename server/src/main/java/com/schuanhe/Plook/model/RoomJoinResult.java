package com.schuanhe.Plook.model;

import java.util.Optional;

public record RoomJoinResult(RoomSnapshot snapshot, String errorCode) {
    public static RoomJoinResult ok(RoomSnapshot snapshot) {
        return new RoomJoinResult(snapshot, null);
    }

    public static RoomJoinResult error(String code) {
        return new RoomJoinResult(null, code);
    }

    public Optional<RoomSnapshot> snapshotOptional() {
        return Optional.ofNullable(snapshot);
    }
}
