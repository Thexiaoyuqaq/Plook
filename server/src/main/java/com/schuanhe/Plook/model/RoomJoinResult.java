package com.schuanhe.Plook.model;

import java.util.Optional;

public record RoomJoinResult(RoomSnapshot snapshot, String errorCode, boolean alreadyMember) {
    public static RoomJoinResult ok(RoomSnapshot snapshot) {
        return new RoomJoinResult(snapshot, null, false);
    }

    public static RoomJoinResult ok(RoomSnapshot snapshot, boolean alreadyMember) {
        return new RoomJoinResult(snapshot, null, alreadyMember);
    }

    public static RoomJoinResult error(String code) {
        return new RoomJoinResult(null, code, false);
    }

    public Optional<RoomSnapshot> snapshotOptional() {
        return Optional.ofNullable(snapshot);
    }
}
