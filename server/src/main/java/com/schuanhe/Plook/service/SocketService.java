package com.schuanhe.Plook.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.schuanhe.Plook.config.AppProperties;
import com.schuanhe.Plook.controller.WebSocket;
import com.schuanhe.Plook.dto.SocketDispatch;
import com.schuanhe.Plook.dto.SocketMessage;
import com.schuanhe.Plook.dto.SocketTypes;
import com.schuanhe.Plook.model.ChatLogEntry;
import com.schuanhe.Plook.model.MemberInfo;
import com.schuanhe.Plook.model.RoomJoinResult;
import com.schuanhe.Plook.model.RoomSnapshot;
import com.schuanhe.Plook.model.VideoSourceState;
import com.schuanhe.Plook.utils.CurPool;
import lombok.extern.slf4j.Slf4j;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * WebSocket 消息编排层：解析消息、驱动 {@link CurPool} 状态变更，并生成需要下发的 {@link SocketDispatch}。
 * 断线不立即退房，而是进入重连宽限期；超时后由后台调度线程真正退房并广播。
 */
@Slf4j
public final class SocketService {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final ScheduledExecutorService GRACE = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "room-grace");
        thread.setDaemon(true);
        return thread;
    });

    private static volatile boolean allowCreateRooms = true;
    private static volatile long reconnectGraceMillis = 360_000L;

    private SocketService() {
    }

    public static void configure(AppProperties.Rooms roomsConfig) {
        allowCreateRooms = roomsConfig == null || roomsConfig.allowCreate();
        long graceSeconds = roomsConfig == null ? 360L : roomsConfig.reconnectGraceSeconds();
        reconnectGraceMillis = Math.max(5L, graceSeconds) * 1000L;
    }

    // ----- 连接生命周期 -------------------------------------------------

    public static SocketDispatch onOpen(String name, String sid) {
        Optional<RoomSnapshot> resumed = CurPool.resume(name, sid);
        if (resumed.isPresent()) {
            RoomSnapshot room = resumed.get();
            log.info("[{}] resumed room [{}] via sid", name, room.roomId());
            return roomSnapshotTo(List.of(name), room).withFollowUps(List.of(
                    presenceSnapshot(room.roomId(), name),
                    singleUser(name, roomListData())
            ));
        }
        return singleUser(name, roomListData());
    }

    public static SocketDispatch onDisconnect(String name, String sid) {
        Optional<String> roomId = CurPool.markAway(name);
        if (roomId.isEmpty()) {
            return SocketDispatch.empty();
        }
        String room = roomId.get();
        log.info("[{}] disconnected, entering reconnect grace for room [{}]", name, room);
        scheduleGrace(name, room);
        return presenceSnapshot(room, name);
    }

    private static void scheduleGrace(String name, String roomId) {
        GRACE.schedule(() -> {
            try {
                CurPool.hardLeaveIfAway(name, roomId).ifPresent(room -> {
                    log.info("[{}] grace expired -> left room [{}]", name, room.roomId());
                    appendSystemHistory(room.roomId(), name, "room_leave");
                    WebSocket.publish(presenceSnapshot(room.roomId(), null).withFollowUps(List.of(
                            roomNotice(memberNames(room), SocketTypes.ROOM_LEAVE, room.roomId(), name, "room_leave"),
                            broadcastRoomList()
                    )));
                });
            } catch (RuntimeException ex) {
                log.warn("grace cleanup failed for {}", name, ex);
            }
        }, reconnectGraceMillis, TimeUnit.MILLISECONDS);
    }

    public static SocketDispatch roomListChanged() {
        return broadcastRoomList();
    }

    // ----- 消息入口 -----------------------------------------------------

    public static SocketDispatch onMessage(String message, String connectionOwner) {
        try {
            SocketMessage socketMessage = MAPPER.readValue(message, SocketMessage.class);
            if (socketMessage.getType() == null) {
                return error(connectionOwner, "missing_type");
            }
            return switch (socketMessage.getType()) {
                case SocketTypes.ROOM -> handleRoomMessage(socketMessage, connectionOwner);
                case SocketTypes.VIDEO -> handleVideoMessage(socketMessage, connectionOwner);
                case SocketTypes.CHAT -> handleChat(socketMessage, connectionOwner);
                case SocketTypes.HEARTBEAT -> SocketDispatch.empty();
                default -> error(connectionOwner, "unknown_message_type");
            };
        } catch (JsonProcessingException ex) {
            log.warn("Invalid socket message from {}: {}", connectionOwner, message, ex);
            return error(connectionOwner, "invalid_json");
        }
    }

    private static SocketDispatch handleRoomMessage(SocketMessage msg, String ownerId) {
        JsonNode data = msg.getData();
        if (data == null || !data.has("type")) {
            return error(ownerId, "missing_room_event_type");
        }
        return switch (data.get("type").asInt()) {
            case SocketTypes.ROOM_JOIN -> handleJoin(msg.getRoomId(), ownerId, data);
            case SocketTypes.ROOM_CREATE -> handleCreate(ownerId, data);
            case SocketTypes.ROOM_LEAVE -> handleLeave(ownerId);
            case SocketTypes.ROOM_LOCK_SOURCE -> handleLockSource(msg.getRoomId(), ownerId, data.path("locked").asBoolean(true));
            case SocketTypes.ROOM_UPDATE_SETTINGS -> handleUpdateSettings(msg.getRoomId(), ownerId, data);
            case SocketTypes.ROOM_DISBAND -> handleDisband(msg.getRoomId(), ownerId);
            default -> error(ownerId, "unsupported_room_event");
        };
    }

    private static SocketDispatch handleJoin(String roomId, String ownerId, JsonNode data) {
        RoomJoinResult result = CurPool.joinRoom(roomId, ownerId, sidOf(ownerId), textValue(data, "password"));
        if (result.snapshotOptional().isEmpty()) {
            String code = result.errorCode();
            return "room_password_invalid".equals(code) ? passwordRequired(ownerId, roomId) : error(ownerId, code);
        }

        RoomSnapshot room = result.snapshot();

        // 刷新/宽限期内重连：已是成员，只同步状态，不产生“进入房间”提示与历史噪声。
        if (result.alreadyMember()) {
            log.info("[{}] re-attached to room [{}]", ownerId, room.roomId());
            return roomSnapshotTo(List.of(ownerId), room).withFollowUps(List.of(
                    presenceSnapshot(room.roomId(), ownerId),
                    broadcastRoomList(),
                    resyncRequest(room, ownerId)
            ));
        }

        log.info("[{}] joined room [{}], members={}", ownerId, room.roomId(), memberNames(room));
        appendSystemHistory(room.roomId(), ownerId, "room_join");
        return roomSnapshotTo(List.of(ownerId), room).withFollowUps(List.of(
                roomNotice(memberNames(room), SocketTypes.ROOM_JOIN, room.roomId(), ownerId, "room_join"),
                presenceSnapshot(room.roomId(), ownerId),
                broadcastRoomList(),
                resyncRequest(room, ownerId)
        ));
    }

    private static SocketDispatch handleCreate(String ownerId, JsonNode data) {
        if (!allowCreateRooms) {
            return error(ownerId, "room_create_disabled");
        }
        Optional<RoomSnapshot> snapshot = CurPool.createRoom(
                textValue(data, "roomName"), ownerId, sidOf(ownerId), textValue(data, "password"), data.path("hidden").asBoolean(false));
        if (snapshot.isEmpty()) {
            return error(ownerId, "room_create_failed");
        }
        RoomSnapshot room = snapshot.get();
        log.info("[{}] created room [{}]", ownerId, room.roomId());
        return roomSnapshotTo(List.of(ownerId), room).withFollowUps(List.of(broadcastRoomList()));
    }

    private static SocketDispatch handleLeave(String ownerId) {
        Optional<RoomSnapshot> snapshot = CurPool.leaveRoom(ownerId);
        if (snapshot.isEmpty()) {
            return error(ownerId, "not_in_room");
        }
        RoomSnapshot room = snapshot.get();
        appendSystemHistory(room.roomId(), ownerId, "room_leave");
        return presenceSnapshot(room.roomId(), null).withFollowUps(List.of(
                roomNotice(memberNames(room), SocketTypes.ROOM_LEAVE, room.roomId(), ownerId, "room_leave"),
                broadcastRoomList()
        ));
    }

    private static SocketDispatch handleDisband(String roomId, String ownerId) {
        Optional<List<String>> members = CurPool.disbandRoom(roomId, ownerId);
        if (members.isEmpty()) {
            return error(ownerId, "owner_required");
        }
        log.info("[{}] disbanded room [{}]", ownerId, roomId);
        return SocketDispatch.of(members.get(),
                        roomEventJson(SocketTypes.ROOM_DISBAND, roomId, ownerId, "room_disbanded", systemText("room_disbanded", ownerId)), null)
                .withFollowUps(List.of(broadcastRoomList()));
    }

    private static SocketDispatch handleUpdateSettings(String roomId, String ownerId, JsonNode data) {
        Optional<RoomSnapshot> snapshot = CurPool.updateRoomSettings(
                roomId, ownerId, textValue(data, "roomName"), textValue(data, "password"), data.path("hidden").asBoolean(false));
        if (snapshot.isEmpty()) {
            return error(ownerId, "owner_required");
        }
        RoomSnapshot room = snapshot.get();
        appendSystemHistory(room.roomId(), ownerId, "room_settings_updated");
        return roomSnapshotTo(memberNames(room), room).withFollowUps(List.of(
                roomNotice(memberNames(room), SocketTypes.ROOM_UPDATE_SETTINGS, room.roomId(), ownerId, "room_settings_updated"),
                broadcastRoomList()
        ));
    }

    private static SocketDispatch handleLockSource(String roomId, String ownerId, boolean locked) {
        Optional<RoomSnapshot> snapshot = CurPool.setSourceLocked(roomId, ownerId, locked);
        if (snapshot.isEmpty()) {
            return error(ownerId, "owner_required");
        }
        RoomSnapshot room = snapshot.get();
        String code = locked ? "source_locked" : "source_unlocked";
        appendSystemHistory(room.roomId(), ownerId, code);
        return roomSnapshotTo(memberNames(room), room).withFollowUps(List.of(
                roomNotice(memberNames(room), SocketTypes.ROOM_LOCK_SOURCE, room.roomId(), ownerId, code),
                broadcastRoomList()
        ));
    }

    // ----- 视频事件 -----------------------------------------------------

    private static SocketDispatch handleVideoMessage(SocketMessage msg, String ownerId) {
        JsonNode data = msg.getData();
        if (data == null || msg.getRoomId() == null || msg.getRoomId().isBlank()) {
            return error(ownerId, "missing_room");
        }
        if (!CurPool.roomMembers(msg.getRoomId()).contains(ownerId)) {
            return error(ownerId, "not_in_room");
        }
        return switch (data.path("type").asInt(-1)) {
            case SocketTypes.VIDEO_PLAYBACK -> handlePlayback(msg, ownerId, data);
            case SocketTypes.VIDEO_SEEK -> handleSeek(msg, ownerId, data);
            case SocketTypes.VIDEO_SOURCE -> handleSource(msg, ownerId, data);
            case SocketTypes.VIDEO_RATE -> handleRate(msg, ownerId, data);
            case SocketTypes.VIDEO_SYNC -> handleSync(msg, ownerId, data);
            case SocketTypes.VIDEO_HOLD -> broadcastRawToRoom(msg, ownerId, "video-hold");
            default -> error(ownerId, "unsupported_video_event");
        };
    }

    private static SocketDispatch handlePlayback(SocketMessage msg, String ownerId, JsonNode data) {
        boolean playing = data.path("play").asInt(0) == 1;
        double currentTime = data.path("currentTime").asDouble(0d);
        double rate = data.path("rate").asDouble(1.0d);
        if (CurPool.updatePlayback(msg.getRoomId(), ownerId, playing, currentTime, rate).isEmpty()) {
            return error(ownerId, "room_state_update_failed");
        }
        return broadcastRawToRoom(msg, ownerId, "video-playback");
    }

    private static SocketDispatch handleSeek(SocketMessage msg, String ownerId, JsonNode data) {
        double reach = data.path("reach").asDouble(0d);
        if (CurPool.seekPlayback(msg.getRoomId(), ownerId, reach).isEmpty()) {
            return error(ownerId, "room_state_update_failed");
        }
        return broadcastRawToRoom(msg, ownerId, "video-seek");
    }

    private static SocketDispatch handleRate(SocketMessage msg, String ownerId, JsonNode data) {
        double rate = data.path("rate").asDouble(1.0d);
        if (CurPool.updateRate(msg.getRoomId(), ownerId, rate).isEmpty()) {
            return error(ownerId, "room_state_update_failed");
        }
        return broadcastRawToRoom(msg, ownerId, "video-rate");
    }

    private static SocketDispatch handleSource(SocketMessage msg, String ownerId, JsonNode data) {
        Optional<RoomSnapshot> snapshot = CurPool.updateVideoSource(
                msg.getRoomId(), ownerId, new VideoSourceState(textValue(data, "src"), textValue(data, "srcType")));
        if (snapshot.isEmpty()) {
            return error(ownerId, "source_locked");
        }
        RoomSnapshot room = snapshot.get();
        appendSystemHistory(room.roomId(), ownerId, "source_updated");
        return roomSnapshotTo(memberNames(room), room).withFollowUps(List.of(
                roomNotice(memberNames(room), SocketTypes.VIDEO_SOURCE, room.roomId(), ownerId, "source_updated"),
                broadcastRoomList()
        ));
    }

    /**
     * 上报权威播放状态。带 targetId 时（给新加入者定向同步）任意成员均可上报；
     * 不带 targetId 的全房广播仅房主可发。
     */
    private static SocketDispatch handleSync(SocketMessage msg, String ownerId, JsonNode data) {
        String targetId = textValue(data, "targetId");
        boolean isOwner = CurPool.ownerOf(msg.getRoomId()).filter(ownerId::equals).isPresent();
        if (targetId.isBlank() && !isOwner) {
            return SocketDispatch.empty();
        }
        boolean playing = data.path("play").asInt(0) == 1;
        double currentTime = data.path("currentTime").asDouble(0d);
        double rate = data.path("rate").asDouble(1.0d);
        CurPool.updatePlayback(msg.getRoomId(), ownerId, playing, currentTime, rate);

        if (!targetId.isBlank()) {
            return SocketDispatch.of(List.of(targetId), rawMessage(msg, ownerId), null);
        }
        return broadcastRawToRoom(msg, ownerId, "video-sync");
    }

    private static SocketDispatch handleChat(SocketMessage msg, String ownerId) {
        if (msg.getRoomId() == null || msg.getRoomId().isBlank()) {
            return error(ownerId, "missing_room");
        }
        if (!CurPool.roomMembers(msg.getRoomId()).contains(ownerId)) {
            return error(ownerId, "not_in_room");
        }
        String text = msg.getData() == null ? "" : textValue(msg.getData(), "msg");
        long sentAt = msg.getSentAt() == null ? now() : msg.getSentAt();
        CurPool.appendHistory(msg.getRoomId(), new ChatLogEntry(UUID.randomUUID().toString(), "chat", ownerId, text, sentAt));
        return broadcastRawToRoom(msg, ownerId, "chat");
    }

    // ----- 下发消息构造 -------------------------------------------------

    private static SocketDispatch broadcastRawToRoom(SocketMessage msg, String ownerId, String kind) {
        List<String> members = CurPool.roomMembers(msg.getRoomId());
        if (members.isEmpty()) {
            return error(ownerId, "room_empty");
        }
        log.debug("[{}] {} event in room [{}]", ownerId, kind, msg.getRoomId());
        return SocketDispatch.of(members, rawMessage(msg, ownerId), ownerId);
    }

    private static SocketDispatch roomSnapshotTo(List<String> names, RoomSnapshot room) {
        ObjectNode data = MAPPER.createObjectNode();
        data.put("type", SocketTypes.ROOM_SNAPSHOT);
        data.putPOJO("room", room);
        return SocketDispatch.of(names, message(SocketTypes.ROOM, data, room.roomId(), "system"), null);
    }

    /** 向房间其余成员下发不含历史的状态快照，用于同步在线状态；{@code excludeName} 不会收到。 */
    private static SocketDispatch presenceSnapshot(String roomId, String excludeName) {
        Optional<RoomSnapshot> snapshot = CurPool.snapshotOf(roomId, excludeName == null ? "system" : excludeName, false);
        if (snapshot.isEmpty()) {
            return SocketDispatch.empty();
        }
        RoomSnapshot room = snapshot.get();
        ObjectNode data = MAPPER.createObjectNode();
        data.put("type", SocketTypes.ROOM_SNAPSHOT);
        data.putPOJO("room", room);
        return SocketDispatch.of(memberNames(room), message(SocketTypes.ROOM, data, room.roomId(), "system"), excludeName);
    }

    /**
     * 请求一位在线成员上报当前进度，用于给新加入者精确同步。优先房主；
     * 房主离线（等待重连）时改由任意其他在线成员上报，避免"没人给数据"。
     */
    private static SocketDispatch resyncRequest(RoomSnapshot room, String joiner) {
        String reporter = chooseReporter(room, joiner);
        if (reporter == null) {
            return SocketDispatch.empty();
        }
        ObjectNode data = MAPPER.createObjectNode();
        data.put("type", SocketTypes.ROOM_RESYNC_REQUEST);
        data.put("requesterId", joiner);
        return SocketDispatch.of(List.of(reporter), message(SocketTypes.ROOM, data, room.roomId(), "system"), null);
    }

    private static String chooseReporter(RoomSnapshot room, String joiner) {
        String owner = room.ownerId();
        if (owner != null && !owner.equals(joiner) && CurPool.isOnline(owner)) {
            return owner;
        }
        for (String member : memberNames(room)) {
            if (!member.equals(joiner) && CurPool.isOnline(member)) {
                return member;
            }
        }
        return null;
    }

    private static SocketDispatch roomNotice(List<String> names, int dataType, String roomId, String actor, String code) {
        if (names == null || names.isEmpty()) {
            return SocketDispatch.empty();
        }
        return SocketDispatch.of(names, roomEventJson(dataType, roomId, actor, code, systemText(code, actor)), actor);
    }

    private static SocketDispatch passwordRequired(String name, String roomId) {
        ObjectNode data = MAPPER.createObjectNode();
        data.put("type", SocketTypes.ROOM_PASSWORD_REQUIRED);
        data.put("code", "room_password_invalid");
        data.put("roomId", roomId);
        return singleUser(name, data);
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

    private static SocketDispatch singleUser(String name, ObjectNode data) {
        return SocketDispatch.of(List.of(name), message(SocketTypes.ROOM, data, null, "system"), null);
    }

    private static SocketDispatch error(String ownerId, String code) {
        ObjectNode data = MAPPER.createObjectNode();
        data.put("type", SocketTypes.ERROR);
        data.put("code", code);
        return singleUser(ownerId, data);
    }

    private static String roomEventJson(int dataType, String roomId, String actor, String code, String text) {
        ObjectNode data = MAPPER.createObjectNode();
        data.put("type", dataType);
        data.put("code", code);
        data.put("roomId", roomId);
        data.put("actorId", actor);
        data.put("text", text);
        return message(SocketTypes.ROOM, data, roomId, actor);
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

    private static List<String> memberNames(RoomSnapshot room) {
        return room.members() == null ? List.of() : room.members().stream().map(MemberInfo::name).toList();
    }

    private static void appendSystemHistory(String roomId, String actor, String code) {
        CurPool.appendHistory(roomId, new ChatLogEntry(UUID.randomUUID().toString(), "system", actor, systemText(code, actor), now()));
    }

    private static String sidOf(String name) {
        return CurPool.findSocket(name).map(WebSocket::sid).orElse(null);
    }

    private static String systemText(String code, String actor) {
        return switch (code) {
            case "room_join" -> actor + " 进入房间";
            case "room_leave" -> actor + " 离开房间";
            case "source_locked" -> actor + " 锁定了视频源";
            case "source_unlocked" -> actor + " 解锁了视频源";
            case "room_settings_updated" -> actor + " 更新了房间设置";
            case "source_updated" -> actor + " 切换了视频源";
            case "room_disbanded" -> "房主已解散房间";
            default -> code;
        };
    }

    private static String textValue(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? "" : value.asText("");
    }

    private static long now() {
        return Instant.now().toEpochMilli();
    }
}
