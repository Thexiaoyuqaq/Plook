package com.schuanhe.Plook.utils;

import com.schuanhe.Plook.controller.WebSocket;
import com.schuanhe.Plook.model.ChatLogEntry;
import com.schuanhe.Plook.model.PlaybackState;
import com.schuanhe.Plook.model.RoomJoinResult;
import com.schuanhe.Plook.model.RoomSnapshot;
import com.schuanhe.Plook.model.RoomState;
import com.schuanhe.Plook.model.RoomSummary;
import com.schuanhe.Plook.model.VideoSourceState;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * 全局内存态：连接注册表、房间状态、成员↔房间映射。
 *
 * <p>连接以昵称为键，但每条连接携带客户端持久化的 {@code sid}。断线时不会立刻退房，
 * 成员在“重连宽限期”内保留在房间里（在线状态记为离线），期间用相同 {@code sid} 重连
 * 可无需重新验证密码直接恢复会话。</p>
 */
public final class CurPool {

    private static final ConcurrentMap<String, WebSocket> webSockets = new ConcurrentHashMap<>();
    private static final ConcurrentMap<String, RoomState> rooms = new ConcurrentHashMap<>();
    private static final ConcurrentMap<String, String> userByRoom = new ConcurrentHashMap<>();
    /** 成员建立/恢复会话时所用的 sid，用于校验重连身份，防止同名顶替。 */
    private static final ConcurrentMap<String, String> sessionByUser = new ConcurrentHashMap<>();

    private static final Pattern ROOM_ID_PATTERN = Pattern.compile("\\d{6}");
    private static volatile long emptyRoomTtlMillis = Duration.ofMinutes(10).toMillis();

    private CurPool() {
    }

    public static void reset(long emptyRoomTtlMinutes) {
        webSockets.clear();
        rooms.clear();
        userByRoom.clear();
        sessionByUser.clear();
        emptyRoomTtlMillis = Duration.ofMinutes(Math.max(1L, emptyRoomTtlMinutes)).toMillis();
    }

    // ----- 连接注册表 -----------------------------------------------------

    /** 注册连接；若同名旧连接仍在，则关闭旧连接（同一昵称仅保留一条活跃连接）。 */
    public static void registerSocket(String name, WebSocket webSocket) {
        if (isBlank(name) || webSocket == null) {
            return;
        }
        WebSocket previous = webSockets.put(name, webSocket);
        if (previous != null && previous != webSocket) {
            previous.closeQuietly();
        }
    }

    /** 仅当传入连接仍是该昵称的当前连接时才移除，避免被延迟到达的旧连接 onClose 误删。 */
    public static boolean removeSocketIfCurrent(String name, WebSocket webSocket) {
        return !isBlank(name) && webSockets.remove(name, webSocket);
    }

    public static Optional<WebSocket> findSocket(String name) {
        return Optional.ofNullable(webSockets.get(name));
    }

    public static boolean isOnline(String name) {
        WebSocket socket = webSockets.get(name);
        return socket != null && socket.isOpen();
    }

    public static Predicate<String> onlineCheck() {
        return CurPool::isOnline;
    }

    public static List<String> socketNames() {
        List<String> names = new ArrayList<>(webSockets.keySet());
        Collections.sort(names);
        return names;
    }

    public static int onlineSocketCount() {
        return webSockets.size();
    }

    // ----- 房间查询 -------------------------------------------------------

    public static int roomCount() {
        purgeExpiredRooms();
        return rooms.size();
    }

    public static List<RoomSummary> roomSummaries() {
        purgeExpiredRooms();
        return rooms.values().stream()
                .filter(room -> !room.hidden())
                .map(RoomState::summary)
                .sorted((left, right) -> left.roomName().compareToIgnoreCase(right.roomName()))
                .toList();
    }

    public static List<String> roomIds() {
        return roomSummaries().stream()
                .map(RoomSummary::roomId)
                .toList();
    }

    public static List<String> roomMembers(String roomId) {
        RoomState room = rooms.get(normalize(roomId));
        return room == null ? List.of() : room.membersSnapshot();
    }

    public static Optional<String> ownerOf(String roomId) {
        RoomState room = rooms.get(normalize(roomId));
        return room == null ? Optional.empty() : Optional.ofNullable(room.ownerId());
    }

    public static Optional<String> currentRoomId(String username) {
        String normalizedUser = normalize(username);
        if (isBlank(normalizedUser)) {
            return Optional.empty();
        }
        return Optional.ofNullable(userByRoom.get(normalizedUser));
    }

    public static Optional<RoomSnapshot> snapshotOf(String roomId, String viewer, boolean includeHistory) {
        RoomState room = rooms.get(normalize(roomId));
        if (room == null) {
            return Optional.empty();
        }
        return Optional.of(room.snapshot(normalize(viewer), now(), onlineCheck(), includeHistory));
    }

    // ----- 会话恢复（重连宽限期内） --------------------------------------

    /**
     * 断线时调用：不立即退房，仅返回成员当前所在房间号（若有），供调用方安排宽限期清理。
     */
    public static Optional<String> markAway(String username) {
        return currentRoomId(username);
    }

    /**
     * 使用相同 {@code sid} 重连时恢复房间会话，无需重新验证密码。
     */
    public static Optional<RoomSnapshot> resume(String username, String sid) {
        String normalizedUser = normalize(username);
        if (isBlank(normalizedUser)) {
            return Optional.empty();
        }
        String roomId = userByRoom.get(normalizedUser);
        if (roomId == null) {
            return Optional.empty();
        }
        RoomState room = rooms.get(roomId);
        if (room == null) {
            userByRoom.remove(normalizedUser, roomId);
            sessionByUser.remove(normalizedUser);
            return Optional.empty();
        }
        String ownerSid = sessionByUser.get(normalizedUser);
        if (ownerSid != null && sid != null && !ownerSid.equals(sid)) {
            // 同名但不同 sid：不静默恢复，交由常规加入流程处理。
            return Optional.empty();
        }
        room.join(normalizedUser);
        return Optional.of(room.snapshot(normalizedUser, now(), onlineCheck(), true));
    }

    /**
     * 宽限期到期后调用：若成员仍处于离线状态且未换房，则真正退房。
     */
    public static Optional<RoomSnapshot> hardLeaveIfAway(String username, String roomId) {
        String normalizedUser = normalize(username);
        String normalizedRoom = normalize(roomId);
        if (isBlank(normalizedUser) || isOnline(normalizedUser)) {
            return Optional.empty();
        }
        if (!normalizedRoom.equals(userByRoom.get(normalizedUser))) {
            return Optional.empty();
        }
        return leaveRoom(normalizedUser);
    }

    // ----- 房间生命周期 ---------------------------------------------------

    public static Optional<RoomSnapshot> createRoom(String roomName, String username, String sid, String password, boolean hidden) {
        String normalizedRoomName = normalize(roomName);
        String normalizedUser = normalize(username);
        if (isBlank(normalizedRoomName) || isBlank(normalizedUser)) {
            return Optional.empty();
        }

        purgeExpiredRooms();
        leaveRoom(normalizedUser);

        long now = now();
        RoomState room = null;
        String generatedRoomId = null;
        for (int attempt = 0; attempt < 20; attempt++) {
            generatedRoomId = generateRoomId();
            room = new RoomState(generatedRoomId, normalizedRoomName, normalizedUser, hashPassword(password), hidden, now);
            if (rooms.putIfAbsent(generatedRoomId, room) == null) {
                break;
            }
            room = null;
        }

        if (room == null) {
            return Optional.empty();
        }

        room.join(normalizedUser);
        userByRoom.put(normalizedUser, generatedRoomId);
        rememberSession(normalizedUser, sid);
        return Optional.of(room.snapshot(normalizedUser, now, onlineCheck(), true));
    }

    public static RoomJoinResult joinRoom(String roomId, String username, String sid, String password) {
        String normalizedRoomId = normalize(roomId);
        String normalizedUser = normalize(username);
        if (!isRoomId(normalizedRoomId) || isBlank(normalizedUser)) {
            return RoomJoinResult.error("invalid_room_id");
        }

        purgeExpiredRooms();
        RoomState room = rooms.get(normalizedRoomId);
        if (room == null) {
            return RoomJoinResult.error("room_not_found");
        }

        boolean alreadyMember = normalizedRoomId.equals(userByRoom.get(normalizedUser)) && room.contains(normalizedUser);
        if (!alreadyMember && !room.passwordMatches(hashPassword(password))) {
            return RoomJoinResult.error("room_password_invalid");
        }

        String previousRoomId = userByRoom.get(normalizedUser);
        if (!normalizedRoomId.equals(previousRoomId)) {
            leaveRoom(normalizedUser);
        }

        room.join(normalizedUser);
        userByRoom.put(normalizedUser, normalizedRoomId);
        rememberSession(normalizedUser, sid);
        return RoomJoinResult.ok(room.snapshot(normalizedUser, now(), onlineCheck(), true), alreadyMember);
    }

    public static Optional<RoomSnapshot> leaveRoom(String username) {
        String normalizedUser = normalize(username);
        if (isBlank(normalizedUser)) {
            return Optional.empty();
        }

        purgeExpiredRooms();
        String roomId = userByRoom.remove(normalizedUser);
        sessionByUser.remove(normalizedUser);
        if (roomId == null) {
            return Optional.empty();
        }

        RoomState room = rooms.get(roomId);
        if (room == null) {
            return Optional.empty();
        }

        room.leave(normalizedUser, now());
        return Optional.of(room.snapshot(normalizedUser, now(), onlineCheck(), false));
    }

    /** 房主解散房间：清空成员，返回原成员列表；非房主返回空。 */
    public static Optional<List<String>> disbandRoom(String roomId, String username) {
        String normalizedRoomId = normalize(roomId);
        String normalizedUser = normalize(username);
        if (isBlank(normalizedRoomId) || isBlank(normalizedUser)) {
            return Optional.empty();
        }
        RoomState room = rooms.get(normalizedRoomId);
        if (room == null || !normalizedUser.equals(room.ownerId())) {
            return Optional.empty();
        }
        List<String> members = room.disband(now());
        rooms.remove(normalizedRoomId, room);
        for (String member : members) {
            userByRoom.remove(member, normalizedRoomId);
            sessionByUser.remove(member);
        }
        return Optional.of(members);
    }

    // ----- 视频 / 播放状态 ------------------------------------------------

    public static Optional<RoomSnapshot> updateVideoSource(String roomId, String username, VideoSourceState source) {
        String normalizedRoomId = normalize(roomId);
        String normalizedUser = normalize(username);
        if (isBlank(normalizedRoomId) || isBlank(normalizedUser) || source == null || !source.hasSource()) {
            return Optional.empty();
        }

        purgeExpiredRooms();
        RoomState room = rooms.get(normalizedRoomId);
        if (room == null || !room.canEditSource(normalizedUser)) {
            return Optional.empty();
        }

        room.setVideoSource(source);
        // 切换视频源时重置播放进度，保留当前倍率。
        room.setPlayback(new PlaybackState(false, 0d, room.playbackState().rate(), now()));
        return Optional.of(room.snapshot(normalizedUser, now(), onlineCheck(), false));
    }

    public static Optional<RoomSnapshot> updatePlayback(String roomId, String username, boolean playing, double currentTime, double rate) {
        RoomState room = memberRoom(roomId, username);
        if (room == null) {
            return Optional.empty();
        }
        room.setPlayback(new PlaybackState(playing, currentTime, rate, now()));
        return Optional.of(room.snapshot(normalize(username), now(), onlineCheck(), false));
    }

    public static Optional<RoomSnapshot> seekPlayback(String roomId, String username, double currentTime) {
        RoomState room = memberRoom(roomId, username);
        if (room == null) {
            return Optional.empty();
        }
        PlaybackState current = room.playbackState();
        room.setPlayback(new PlaybackState(current.playing(), currentTime, current.rate(), now()));
        return Optional.of(room.snapshot(normalize(username), now(), onlineCheck(), false));
    }

    public static Optional<RoomSnapshot> updateRate(String roomId, String username, double rate) {
        RoomState room = memberRoom(roomId, username);
        if (room == null) {
            return Optional.empty();
        }
        PlaybackState current = room.playbackState();
        room.setPlayback(new PlaybackState(current.playing(), current.effectiveCurrentTime(now()), rate, now()));
        return Optional.of(room.snapshot(normalize(username), now(), onlineCheck(), false));
    }

    public static Optional<RoomSnapshot> setSourceLocked(String roomId, String username, boolean locked) {
        String normalizedRoomId = normalize(roomId);
        String normalizedUser = normalize(username);
        if (isBlank(normalizedRoomId) || isBlank(normalizedUser)) {
            return Optional.empty();
        }

        purgeExpiredRooms();
        RoomState room = rooms.get(normalizedRoomId);
        if (room == null || !normalizedUser.equals(room.ownerId())) {
            return Optional.empty();
        }

        room.setSourceLocked(locked);
        return Optional.of(room.snapshot(normalizedUser, now(), onlineCheck(), false));
    }

    public static Optional<RoomSnapshot> updateRoomSettings(String roomId, String username, String roomName, String password, boolean hidden) {
        String normalizedRoomId = normalize(roomId);
        String normalizedUser = normalize(username);
        if (!isRoomId(normalizedRoomId) || isBlank(normalizedUser)) {
            return Optional.empty();
        }

        purgeExpiredRooms();
        RoomState room = rooms.get(normalizedRoomId);
        if (room == null || !normalizedUser.equals(room.ownerId())) {
            return Optional.empty();
        }

        room.updateSettings(normalize(roomName), hashPassword(password), hidden);
        return Optional.of(room.snapshot(normalizedUser, now(), onlineCheck(), false));
    }

    // ----- 历史消息 -------------------------------------------------------

    public static void appendHistory(String roomId, ChatLogEntry entry) {
        RoomState room = rooms.get(normalize(roomId));
        if (room != null) {
            room.appendChat(entry);
        }
    }

    // ----- 过期清理 -------------------------------------------------------

    public static List<String> purgeExpiredRooms() {
        long now = now();
        List<String> expiredRoomIds = rooms.entrySet().stream()
                .filter(entry -> shouldExpire(entry.getValue(), now))
                .map(java.util.Map.Entry::getKey)
                .toList();

        for (String roomId : expiredRoomIds) {
            RoomState removed = rooms.remove(roomId);
            if (removed != null) {
                removed.membersSnapshot().forEach(member -> {
                    userByRoom.remove(member, roomId);
                    sessionByUser.remove(member);
                });
            }
        }
        return expiredRoomIds;
    }

    private static RoomState memberRoom(String roomId, String username) {
        String normalizedRoomId = normalize(roomId);
        String normalizedUser = normalize(username);
        if (isBlank(normalizedRoomId) || isBlank(normalizedUser)) {
            return null;
        }
        purgeExpiredRooms();
        RoomState room = rooms.get(normalizedRoomId);
        return room != null && room.contains(normalizedUser) ? room : null;
    }

    private static void rememberSession(String username, String sid) {
        if (!isBlank(sid)) {
            sessionByUser.put(username, sid);
        }
    }

    private static boolean shouldExpire(RoomState room, long now) {
        return room != null
                && room.isEmpty()
                && room.emptySince() != null
                && now - room.emptySince() >= emptyRoomTtlMillis;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean isRoomId(String value) {
        return value != null && ROOM_ID_PATTERN.matcher(value).matches();
    }

    private static String generateRoomId() {
        return String.valueOf(ThreadLocalRandom.current().nextInt(100000, 1000000));
    }

    private static String hashPassword(String password) {
        String normalized = normalize(password);
        if (normalized.isBlank()) {
            return "";
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(normalized.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }

    private static long now() {
        return Instant.now().toEpochMilli();
    }
}
