package com.schuanhe.Plook.model;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Objects;
import java.util.function.Predicate;

/**
 * 单个房间的内存状态：成员、视频源、播放状态、房间历史（最多 50 条）。
 * 所有可变状态的读写都在实例锁内完成，保证并发安全。
 */
public final class RoomState {

    /** 每个活跃房间保留的历史消息上限。 */
    public static final int HISTORY_LIMIT = 50;

    private final String roomId;
    private final String ownerId;
    private final long createdAt;
    private final java.util.Set<String> members = new java.util.LinkedHashSet<>();
    private final Deque<ChatLogEntry> history = new ArrayDeque<>();

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

    public synchronized boolean contains(String username) {
        return members.contains(username);
    }

    public synchronized List<String> membersSnapshot() {
        List<String> snapshot = new ArrayList<>(members);
        snapshot.sort(String::compareTo);
        return snapshot;
    }

    /** 解散房间：清空成员并返回原成员列表（用于通知）。 */
    public synchronized List<String> disband(long now) {
        List<String> previous = membersSnapshot();
        members.clear();
        emptySince = now;
        return previous;
    }

    public synchronized void appendChat(ChatLogEntry entry) {
        if (entry == null) {
            return;
        }
        history.addLast(entry);
        while (history.size() > HISTORY_LIMIT) {
            history.removeFirst();
        }
    }

    public synchronized List<ChatLogEntry> historySnapshot() {
        return new ArrayList<>(history);
    }

    public synchronized RoomSummary summary() {
        return new RoomSummary(roomId, roomName, ownerId, members.size(), sourceLocked, hidden, hasPassword(), emptySince, createdAt);
    }

    /**
     * 构建房间快照。
     *
     * @param onlineCheck   判断某成员当前是否有活跃连接（在线 vs 宽限期离线）
     * @param includeHistory 是否携带历史消息（仅加入/重连快照为 true）
     */
    public synchronized RoomSnapshot snapshot(String viewer, long now, Predicate<String> onlineCheck, boolean includeHistory) {
        List<MemberInfo> memberInfos = new ArrayList<>();
        for (String member : membersSnapshot()) {
            boolean online = onlineCheck == null || onlineCheck.test(member);
            memberInfos.add(new MemberInfo(member, online, Objects.equals(ownerId, member)));
        }
        return new RoomSnapshot(
                roomId,
                roomName,
                ownerId,
                Objects.equals(ownerId, viewer),
                sourceLocked,
                hidden,
                hasPassword(),
                memberInfos,
                videoSource,
                playback.snapshot(now),
                includeHistory ? historySnapshot() : null,
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
