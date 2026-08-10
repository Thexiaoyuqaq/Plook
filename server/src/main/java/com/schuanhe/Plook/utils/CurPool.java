package com.schuanhe.Plook.utils;

import com.schuanhe.Plook.controller.WebSocket;
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
import java.util.regex.Pattern;

public final class CurPool {

    private static final ConcurrentMap<String, WebSocket> webSockets = new ConcurrentHashMap<>();
    private static final ConcurrentMap<String, RoomState> rooms = new ConcurrentHashMap<>();
    private static final ConcurrentMap<String, String> userByRoom = new ConcurrentHashMap<>();

    private static final Pattern ROOM_ID_PATTERN = Pattern.compile("\\d{6}");
    private static volatile long emptyRoomTtlMillis = Duration.ofMinutes(10).toMillis();

    private CurPool() {
    }

    public static void reset(long emptyRoomTtlMinutes) {
        webSockets.clear();
        rooms.clear();
        userByRoom.clear();
        emptyRoomTtlMillis = Duration.ofMinutes(Math.max(1L, emptyRoomTtlMinutes)).toMillis();
    }

    public static void registerSocket(String name, WebSocket webSocket) {
        if (!isBlank(name) && webSocket != null) {
            webSockets.put(name, webSocket);
        }
    }

    public static void removeSocket(String name) {
        if (!isBlank(name)) {
            webSockets.remove(name);
        }
    }

    public static Optional<WebSocket> findSocket(String name) {
        return Optional.ofNullable(webSockets.get(name));
    }

    public static List<String> socketNames() {
        List<String> names = new ArrayList<>(webSockets.keySet());
        Collections.sort(names);
        return names;
    }

    public static int onlineSocketCount() {
        return webSockets.size();
    }

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

    public static Optional<RoomSnapshot> createRoom(String roomName, String username, String password, boolean hidden) {
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
        return Optional.of(room.snapshot(normalizedUser, now));
    }

    public static RoomJoinResult joinRoom(String roomId, String username, String password) {
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

        if (!room.passwordMatches(hashPassword(password))) {
            return RoomJoinResult.error("room_password_invalid");
        }

        String previousRoomId = userByRoom.get(normalizedUser);
        if (!normalizedRoomId.equals(previousRoomId)) {
            leaveRoom(normalizedUser);
        }

        room.join(normalizedUser);
        userByRoom.put(normalizedUser, normalizedRoomId);
        return RoomJoinResult.ok(room.snapshot(normalizedUser, now()));
    }

    public static Optional<RoomSnapshot> leaveRoom(String username) {
        String normalizedUser = normalize(username);
        if (isBlank(normalizedUser)) {
            return Optional.empty();
        }

        purgeExpiredRooms();
        String roomId = userByRoom.remove(normalizedUser);
        if (roomId == null) {
            return Optional.empty();
        }

        RoomState room = rooms.get(roomId);
        if (room == null) {
            return Optional.empty();
        }

        room.leave(normalizedUser, now());
        return Optional.of(room.snapshot(normalizedUser, now()));
    }

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
        return Optional.of(room.snapshot(normalizedUser, now()));
    }

    public static Optional<RoomSnapshot> updatePlayback(String roomId, String username, PlaybackState playback) {
        String normalizedRoomId = normalize(roomId);
        String normalizedUser = normalize(username);
        if (isBlank(normalizedRoomId) || isBlank(normalizedUser) || playback == null) {
            return Optional.empty();
        }

        purgeExpiredRooms();
        RoomState room = rooms.get(normalizedRoomId);
        if (room == null) {
            return Optional.empty();
        }

        room.setPlayback(playback);
        return Optional.of(room.snapshot(normalizedUser, now()));
    }

    public static Optional<RoomSnapshot> seekPlayback(String roomId, String username, double currentTime) {
        String normalizedRoomId = normalize(roomId);
        String normalizedUser = normalize(username);
        if (isBlank(normalizedRoomId) || isBlank(normalizedUser)) {
            return Optional.empty();
        }

        purgeExpiredRooms();
        RoomState room = rooms.get(normalizedRoomId);
        if (room == null) {
            return Optional.empty();
        }

        PlaybackState current = room.playbackState();
        room.setPlayback(new PlaybackState(current.playing(), currentTime, now()));
        return Optional.of(room.snapshot(normalizedUser, now()));
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
        return Optional.of(room.snapshot(normalizedUser, now()));
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
        return Optional.of(room.snapshot(normalizedUser, now()));
    }

    public static Optional<String> currentRoomId(String username) {
        String normalizedUser = normalize(username);
        if (isBlank(normalizedUser)) {
            return Optional.empty();
        }
        return Optional.ofNullable(userByRoom.get(normalizedUser));
    }

    public static List<String> purgeExpiredRooms() {
        long now = now();
        List<String> expiredRoomIds = rooms.entrySet().stream()
                .filter(entry -> shouldExpire(entry.getValue(), now))
                .map(entry -> entry.getKey())
                .toList();

        for (String roomId : expiredRoomIds) {
            RoomState removed = rooms.remove(roomId);
            if (removed != null) {
                removed.membersSnapshot().forEach(member -> userByRoom.remove(member, roomId));
            }
        }
        return expiredRoomIds;
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
