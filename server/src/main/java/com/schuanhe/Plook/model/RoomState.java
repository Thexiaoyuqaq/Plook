package com.schuanhe.Plook.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public final class RoomState {
    private final String roomId;
    private final String ownerId;
    private final long createdAt;
    private final Set<String> members = new LinkedHashSet<>();

    private String roomName;
    private String passwordHash;
    private VideoSourceState videoSource;
    private PlaybackState playback = PlaybackState.idle();
    private boolean sourceLocked;
    private boolean hidden;
    private Long emptySince;

    public RoomState(String roomId, String roomName, String ownerId, String passwordHash, boolean hidden, long createdAt) {
        this.roomId = roomId;
        this.roomName = roomName;
        this.ownerId = ownerId;
        this.passwordHash = passwordHash;
        this.hidden = hidden;
        this.createdAt = createdAt;
    }

    public synchronized boolean join(String username) {
        boolean added = members.add(username);
        if (added) {
            emptySince = null;
        }
        return added;
    }

    public synchronized boolean leave(String username, long now) {
        boolean removed = members.remove(username);
        if (removed && members.isEmpty()) {
            emptySince = now;
        }
        return removed;
    }

    public synchronized List<String> membersSnapshot() {
        List<String> snapshot = new ArrayList<>(members);
        Collections.sort(snapshot);
        return snapshot;
    }

    public synchronized RoomSummary summary() {
        return new RoomSummary(roomId, roomName, ownerId, members.size(), sourceLocked, hidden, hasPassword(), emptySince, createdAt);
    }

    public synchronized RoomSnapshot snapshot(String viewer, long now) {
        return new RoomSnapshot(
                roomId,
                roomName,
                ownerId,
                Objects.equals(ownerId, viewer),
                sourceLocked,
                hidden,
                hasPassword(),
                membersSnapshot(),
                videoSource,
                playback.snapshot(now),
                emptySince,
                createdAt
        );
    }

    public synchronized boolean canEditSource(String username) {
        return !sourceLocked || Objects.equals(ownerId, username);
    }

    public synchronized void setVideoSource(VideoSourceState source) {
        this.videoSource = source;
    }

    public synchronized void setPlayback(PlaybackState playback) {
        this.playback = playback;
    }

    public synchronized PlaybackState playbackState() {
        return playback;
    }

    public synchronized void setSourceLocked(boolean locked) {
        this.sourceLocked = locked;
    }

    public synchronized void updateSettings(String nextRoomName, String nextPasswordHash, boolean nextHidden) {
        if (nextRoomName != null && !nextRoomName.isBlank()) {
            roomName = nextRoomName;
        }
        passwordHash = nextPasswordHash;
        hidden = nextHidden;
    }

    public synchronized boolean passwordMatches(String hash) {
        return !hasPassword() || Objects.equals(passwordHash, hash);
    }

    public synchronized boolean hasPassword() {
        return passwordHash != null && !passwordHash.isBlank();
    }

    public synchronized boolean hidden() {
        return hidden;
    }

    public synchronized boolean isEmpty() {
        return members.isEmpty();
    }

    public synchronized Long emptySince() {
        return emptySince;
    }

    public String roomId() {
        return roomId;
    }

    public String roomName() {
        return roomName;
    }

    public String ownerId() {
        return ownerId;
    }

    public long createdAt() {
        return createdAt;
    }
}
