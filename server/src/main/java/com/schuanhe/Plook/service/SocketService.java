package com.schuanhe.Plook.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.schuanhe.Plook.config.AppProperties;
import com.schuanhe.Plook.dto.SocketDispatch;
import com.schuanhe.Plook.dto.SocketMessage;
import com.schuanhe.Plook.dto.SocketTypes;
import com.schuanhe.Plook.model.PlaybackState;
import com.schuanhe.Plook.model.RoomJoinResult;
import com.schuanhe.Plook.model.RoomSnapshot;
import com.schuanhe.Plook.model.VideoSourceState;
import com.schuanhe.Plook.utils.CurPool;
import lombok.extern.slf4j.Slf4j;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Slf4j
public final class SocketService {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static volatile boolean allowCreateRooms = true;

    private SocketService() {
    }

    public static void configure(AppProperties.Rooms roomsConfig) {
        allowCreateRooms = roomsConfig == null || roomsConfig.allowCreate();
    }

    public static SocketDispatch onOpen(String name) {
        return singleUser(name, SocketTypes.ROOM, roomListData(), null, "system");
    }

    public static SocketDispatch roomListChanged() {
        return broadcastRoomList();
    }

    public static SocketDispatch onMessage(String message, String connectionOwner) {
        try {
            SocketMessage socketMessage = MAPPER.readValue(message, SocketMessage.class);
            if (socketMessage.getOwnerId() != null && !socketMessage.getOwnerId().equals(connectionOwner)) {
                log.warn("Ignoring spoofed ownerId [{}] from connection [{}]", socketMessage.getOwnerId(), connectionOwner);
            }

            if (socketMessage.getType() == null) {
                return error(connectionOwner, "missing_type");
            }

            return switch (socketMessage.getType()) {
                case SocketTypes.ROOM -> handleRoomMessage(socketMessage, connectionOwner);
                case SocketTypes.VIDEO -> handleVideoMessage(socketMessage, connectionOwner);
                case SocketTypes.CHAT -> broadcastRawToRoom(socketMessage, connectionOwner, "chat");
                case SocketTypes.HEARTBEAT -> SocketDispatch.empty();
                default -> error(connectionOwner, "unknown_message_type");
            };
        } catch (JsonProcessingException ex) {
            log.warn("Invalid socket message from {}: {}", connectionOwner, message, ex);
            return error(connectionOwner, "invalid_json");
        }
    }

    public static SocketDispatch onClose(String name) {
        CurPool.removeSocket(name);
        Optional<RoomSnapshot> snapshot = CurPool.leaveRoom(name);
        if (snapshot.isEmpty()) {
            return SocketDispatch.empty();
        }

        RoomSnapshot room = snapshot.get();
        log.info("[{}] left room [{}], remaining={}", name, room.roomId(), room.members());
        return roomSnapshot(room).withFollowUps(List.of(
                roomNotice(room.members(), SocketTypes.ROOM_LEAVE, room.roomId(), name, "room_leave"),
                broadcastRoomList()
        ));
    }

    private static SocketDispatch handleRoomMessage(SocketMessage msg, String ownerId) {
        JsonNode data = msg.getData();
        if (data == null || !data.has("type")) {
            return error(ownerId, "missing_room_event_type");
        }

        int dataType = data.get("type").asInt();
        return switch (dataType) {
            case SocketTypes.ROOM_JOIN -> handleJoin(msg.getRoomId(), ownerId, data);
            case SocketTypes.ROOM_CREATE -> handleCreate(ownerId, data);
            case SocketTypes.ROOM_LEAVE -> handleLeave(ownerId);
            case SocketTypes.ROOM_LOCK_SOURCE -> handleLockSource(msg.getRoomId(), ownerId, data.path("locked").asBoolean(true));
            case SocketTypes.ROOM_UPDATE_SETTINGS -> handleUpdateSettings(msg.getRoomId(), ownerId, data);
            default -> error(ownerId, "unsupported_room_event");
        };
    }

    private static SocketDispatch handleJoin(String roomId, String ownerId, JsonNode data) {
        RoomJoinResult result = CurPool.joinRoom(roomId, ownerId, textValue(data, "password"));
        if (result.snapshotOptional().isEmpty()) {
            return error(ownerId, result.errorCode());
        }

        RoomSnapshot room = result.snapshot();
        log.info("[{}] joined room [{}], members={}", ownerId, room.roomId(), room.members());
        return roomSnapshot(room).withFollowUps(List.of(
                roomNotice(room.members(), SocketTypes.ROOM_JOIN, room.roomId(), ownerId, "room_join"),
                broadcastRoomList()
        ));
    }

    private static SocketDispatch handleCreate(String ownerId, JsonNode data) {
        if (!allowCreateRooms) {
            return error(ownerId, "room_create_disabled");
        }

        Optional<RoomSnapshot> snapshot = CurPool.createRoom(
                textValue(data, "roomName"),
                ownerId,
                textValue(data, "password"),
                data.path("hidden").asBoolean(false)
        );
        if (snapshot.isEmpty()) {
            return error(ownerId, "room_create_failed");
        }

        RoomSnapshot room = snapshot.get();
        log.info("[{}] created room [{}]", ownerId, room.roomId());
        return roomSnapshot(room).withFollowUps(List.of(broadcastRoomList()));
    }

    private static SocketDispatch handleLeave(String ownerId) {
        Optional<RoomSnapshot> snapshot = CurPool.leaveRoom(ownerId);
        if (snapshot.isEmpty()) {
            return error(ownerId, "not_in_room");
        }

        RoomSnapshot room = snapshot.get();
        log.info("[{}] left room [{}], remaining={}", ownerId, room.roomId(), room.members());
        return roomSnapshot(room).withFollowUps(List.of(
                roomNotice(room.members(), SocketTypes.ROOM_LEAVE, room.roomId(), ownerId, "room_leave"),
                broadcastRoomList()
        ));
    }

    private static SocketDispatch handleUpdateSettings(String roomId, String ownerId, JsonNode data) {
        Optional<RoomSnapshot> snapshot = CurPool.updateRoomSettings(
                roomId,
                ownerId,
                textValue(data, "roomName"),
                textValue(data, "password"),
                data.path("hidden").asBoolean(false)
        );
        if (snapshot.isEmpty()) {
            return error(ownerId, "owner_required");
        }

        RoomSnapshot room = snapshot.get();
        log.info("[{}] updated room [{}] settings hidden={} password={}", ownerId, room.roomId(), room.hidden(), room.hasPassword());
        return roomSnapshot(room).withFollowUps(List.of(
                roomNotice(room.members(), SocketTypes.ROOM_UPDATE_SETTINGS, room.roomId(), ownerId, "room_settings_updated"),
                broadcastRoomList()
        ));
    }

    private static SocketDispatch handleLockSource(String roomId, String ownerId, boolean locked) {
        Optional<RoomSnapshot> snapshot = CurPool.setSourceLocked(roomId, ownerId, locked);
        if (snapshot.isEmpty()) {
            return error(ownerId, "owner_required");
        }

        RoomSnapshot room = snapshot.get();
        log.info("[{}] set source lock={} in room [{}]", ownerId, locked, room.roomId());
        return roomSnapshot(room).withFollowUps(List.of(
                roomNotice(room.members(), SocketTypes.ROOM_LOCK_SOURCE, room.roomId(), ownerId, locked ? "source_locked" : "source_unlocked"),
                broadcastRoomList()
        ));
    }

    private static SocketDispatch handleVideoMessage(SocketMessage msg, String ownerId) {
        JsonNode data = msg.getData();
        if (data == null || msg.getRoomId() == null || msg.getRoomId().isBlank()) {
            return error(ownerId, "missing_room");
        }

        if (!CurPool.roomMembers(msg.getRoomId()).contains(ownerId)) {
            return error(ownerId, "not_in_room");
        }

        int eventType = data.path("type").asInt(-1);
        return switch (eventType) {
            case SocketTypes.VIDEO_PLAYBACK -> handlePlayback(msg, ownerId, data);
            case SocketTypes.VIDEO_SEEK -> handleSeek(msg, ownerId, data);
            case SocketTypes.VIDEO_SOURCE -> handleSource(msg, ownerId, data);
            default -> error(ownerId, "unsupported_video_event");
        };
    }

    private static SocketDispatch handlePlayback(SocketMessage msg, String ownerId, JsonNode data) {
        boolean playing = data.path("play").asInt(0) == 1;
        double currentTime = data.path("currentTime").asDouble(0d);
        Optional<RoomSnapshot> snapshot = CurPool.updatePlayback(
                msg.getRoomId(),
                ownerId,
                new PlaybackState(playing, currentTime, now())
        );
        if (snapshot.isEmpty()) {
            return error(ownerId, "room_state_update_failed");
        }
        return broadcastRawToRoom(msg, ownerId, "video");
    }

    private static SocketDispatch handleSeek(SocketMessage msg, String ownerId, JsonNode data) {
        double reach = data.path("reach").asDouble(0d);
        Optional<RoomSnapshot> snapshot = CurPool.seekPlayback(msg.getRoomId(), ownerId, reach);
        if (snapshot.isEmpty()) {
            return error(ownerId, "room_state_update_failed");
        }
        return broadcastRawToRoom(msg, ownerId, "video");
    }

    private static SocketDispatch handleSource(SocketMessage msg, String ownerId, JsonNode data) {
        String src = textValue(data, "src");
        String srcType = textValue(data, "srcType");
        Optional<RoomSnapshot> snapshot = CurPool.updateVideoSource(
                msg.getRoomId(),
                ownerId,
                new VideoSourceState(src, srcType)
        );
        if (snapshot.isEmpty()) {
            return error(ownerId, "source_locked");
        }

        RoomSnapshot room = snapshot.get();
        return roomSnapshot(room).withFollowUps(List.of(
                roomNotice(room.members(), SocketTypes.VIDEO_SOURCE, room.roomId(), ownerId, "source_updated"),
                broadcastRoomList()
        ));
    }

    private static SocketDispatch broadcastRawToRoom(SocketMessage msg, String ownerId, String kind) {
        List<String> members = CurPool.roomMembers(msg.getRoomId());
        if (members.isEmpty()) {
            return error(ownerId, "room_empty");
        }

        log.info("[{}] {} event in room [{}]", ownerId, kind, msg.getRoomId());
        return SocketDispatch.of(members, rawMessage(msg, ownerId), ownerId);
    }

    private static SocketDispatch roomSnapshot(RoomSnapshot room) {
        ObjectNode data = MAPPER.createObjectNode();
        data.put("type", SocketTypes.ROOM_SNAPSHOT);
        data.putPOJO("room", room);
        return SocketDispatch.of(room.members(), message(SocketTypes.ROOM, data, room.roomId(), "system"), null);
    }

    private static SocketDispatch roomNotice(List<String> names, int dataType, String roomId, String ownerId, String code) {
        if (names == null || names.isEmpty()) {
            return SocketDispatch.empty();
        }

        ObjectNode data = MAPPER.createObjectNode();
        data.put("type", dataType);
        data.put("code", code);
        data.put("roomId", roomId);
        data.put("actorId", ownerId);
        return SocketDispatch.of(names, message(SocketTypes.ROOM, data, roomId, ownerId), ownerId);
    }

    private static SocketDispatch broadcastRoomList() {
        return SocketDispatch.of(CurPool.socketNames(), message(SocketTypes.ROOM, roomListData(), null, "system"), null);
    }

    private static ObjectNode roomListData() {
        ObjectNode data = MAPPER.createObjectNode();
        data.put("type", SocketTypes.ROOM_LIST);
        data.putPOJO("roomList", CurPool.roomSummaries());
        return data;
    }

    private static SocketDispatch singleUser(String name, int type, ObjectNode data, String roomId, String ownerId) {
        return SocketDispatch.of(List.of(name), message(type, data, roomId, ownerId), null);
    }

    private static SocketDispatch error(String ownerId, String code) {
        ObjectNode data = MAPPER.createObjectNode();
        data.put("type", SocketTypes.ERROR);
        data.put("code", code);
        return singleUser(ownerId, SocketTypes.ROOM, data, null, "system");
    }

    private static String message(int type, ObjectNode data, String roomId, String ownerId) {
        ObjectNode root = MAPPER.createObjectNode();
        root.put("type", type);
        root.set("data", data);
        if (roomId == null || roomId.isBlank()) {
            root.putNull("roomId");
        } else {
            root.put("roomId", roomId);
        }
        if (ownerId == null || ownerId.isBlank()) {
            root.putNull("ownerId");
        } else {
            root.put("ownerId", ownerId);
        }
        root.put("sentAt", now());
        try {
            return MAPPER.writeValueAsString(root);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Unable to serialize socket message", ex);
        }
    }

    private static String rawMessage(SocketMessage message, String ownerId) {
        ObjectNode data = message.getData() == null ? MAPPER.createObjectNode() : message.getData().deepCopy();
        return message(message.getType(), data, message.getRoomId(), ownerId);
    }

    private static String textValue(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? "" : value.asText("");
    }

    private static long now() {
        return Instant.now().toEpochMilli();
    }
}
