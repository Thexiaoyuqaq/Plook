package com.schuanhe.Plook.service;

import com.schuanhe.Plook.dto.SocketDispatch;
import com.schuanhe.Plook.utils.CurPool;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SocketServiceTest {

    @BeforeEach
    void setUp() {
        CurPool.reset(10L);
        SocketService.configure(null);
    }

    @Test
    void onOpenReturnsEmptyRoomListWhenNoUserCreatedRoomsExist() {
        SocketDispatch dispatch = SocketService.onOpen("alice");

        assertThat(dispatch.names()).containsExactly("alice");
        assertThat(dispatch.data()).contains("\"roomList\":[]");
    }

    @Test
    void createRoomCreatesOwnerSnapshotWithGeneratedRoomId() {
        SocketDispatch dispatch = SocketService.onMessage(roomCreate("room-a", "alice", "", false), "alice");
        String roomId = CurPool.roomIds().get(0);

        assertThat(roomId).matches("\\d{6}");
        assertThat(CurPool.roomMembers(roomId)).containsExactly("alice");
        assertThat(dispatch.data()).contains("\"type\":4");
        assertThat(dispatch.data()).contains("\"ownerId\":\"alice\"");
        assertThat(dispatch.data()).contains("\"roomName\":\"room-a\"");
    }

    @Test
    void lateJoinerReceivesVideoSourceSnapshot() {
        SocketService.onMessage(roomCreate("room-a", "alice", "", false), "alice");
        String roomId = CurPool.roomIds().get(0);
        SocketService.onMessage(source(roomId, "alice", "https://example.com/a.mp4"), "alice");

        SocketDispatch dispatch = SocketService.onMessage(roomJoin(roomId, "bob", ""), "bob");

        assertThat(dispatch.data()).contains("\"type\":4");
        assertThat(dispatch.data()).contains("https://example.com/a.mp4");
    }

    @Test
    void hiddenCreatedRoomDoesNotEnterPublicList() {
        SocketService.onMessage(roomCreate("private-room", "alice", "", true), "alice");

        SocketDispatch dispatch = SocketService.onOpen("bob");

        assertThat(dispatch.data()).contains("\"roomList\":[]");
    }

    @Test
    void passwordProtectedRoomRejectsWrongPassword() {
        SocketService.onMessage(roomCreate("room-a", "alice", "secret", false), "alice");
        String roomId = CurPool.roomIds().get(0);

        SocketDispatch dispatch = SocketService.onMessage(roomJoin(roomId, "bob", "bad"), "bob");

        assertThat(dispatch.names()).containsExactly("bob");
        assertThat(dispatch.data()).contains("room_password_invalid");
    }

    @Test
    void ownerCanUpdateRoomSettings() {
        SocketService.onMessage(roomCreate("room-a", "alice", "", false), "alice");
        String roomId = CurPool.roomIds().get(0);

        SocketDispatch dispatch = SocketService.onMessage(roomSettings(roomId, "alice", "new-name", "secret", true), "alice");

        assertThat(dispatch.data()).contains("\"roomName\":\"new-name\"");
        assertThat(dispatch.data()).contains("\"hidden\":true");
        assertThat(dispatch.data()).contains("\"hasPassword\":true");
        assertThat(CurPool.roomSummaries()).isEmpty();
    }

    @Test
    void ownerCanLockSourceAndNonOwnerCannotChangeIt() {
        SocketService.onMessage(roomCreate("room-a", "alice", "", false), "alice");
        String roomId = CurPool.roomIds().get(0);
        SocketService.onMessage(roomJoin(roomId, "bob", ""), "bob");
        SocketService.onMessage(lockSource(roomId, "alice", true), "alice");

        SocketDispatch dispatch = SocketService.onMessage(source(roomId, "bob", "https://example.com/b.mp4"), "bob");

        assertThat(dispatch.names()).containsExactly("bob");
        assertThat(dispatch.data()).contains("source_locked");
    }

    @Test
    void malformedMessageReturnsSenderScopedError() {
        SocketDispatch dispatch = SocketService.onMessage("{bad-json", "alice");

        assertThat(dispatch.names()).containsExactly("alice");
        assertThat(dispatch.data()).contains("invalid_json");
    }

    @Test
    void ignoresSpoofedOwnerIdFromPayload() {
        SocketDispatch dispatch = SocketService.onMessage(roomCreate("room-a", "mallory", "", false), "alice");

        assertThat(dispatch.data()).contains("\"ownerId\":\"alice\"");
    }

    @Test
    void heartbeatDoesNotBroadcast() {
        String payload = """
                {"type":4,"data":{"type":0},"roomId":"123456","ownerId":"alice","sentAt":1}
                """;

        SocketDispatch dispatch = SocketService.onMessage(payload, "alice");

        assertThat(dispatch.hasPayload()).isFalse();
    }

    private static String roomCreate(String roomName, String ownerId, String password, boolean hidden) {
        return """
                {"type":1,"data":{"type":3,"roomName":"%s","password":"%s","hidden":%s},"roomId":null,"ownerId":"%s","sentAt":1}
                """.formatted(roomName, password, hidden, ownerId);
    }

    private static String roomJoin(String roomId, String ownerId, String password) {
        return """
                {"type":1,"data":{"type":1,"password":"%s"},"roomId":"%s","ownerId":"%s","sentAt":1}
                """.formatted(password, roomId, ownerId);
    }

    private static String roomSettings(String roomId, String ownerId, String roomName, String password, boolean hidden) {
        return """
                {"type":1,"data":{"type":6,"roomName":"%s","password":"%s","hidden":%s},"roomId":"%s","ownerId":"%s","sentAt":1}
                """.formatted(roomName, password, hidden, roomId, ownerId);
    }

    private static String lockSource(String roomId, String ownerId, boolean locked) {
        return """
                {"type":1,"data":{"type":5,"locked":%s},"roomId":"%s","ownerId":"%s","sentAt":1}
                """.formatted(locked, roomId, ownerId);
    }

    private static String source(String roomId, String ownerId, String src) {
        return """
                {"type":2,"data":{"type":2,"src":"%s","srcType":"video/mp4"},"roomId":"%s","ownerId":"%s","sentAt":1}
                """.formatted(src, roomId, ownerId);
    }
}
