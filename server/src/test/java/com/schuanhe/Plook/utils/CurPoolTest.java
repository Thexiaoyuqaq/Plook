package com.schuanhe.Plook.utils;

import com.schuanhe.Plook.model.RoomJoinResult;
import com.schuanhe.Plook.model.VideoSourceState;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.assertj.core.api.Assertions.assertThat;

class CurPoolTest {

    @BeforeEach
    void setUp() {
        CurPool.reset(10L);
    }

    @Test
    void createdRoomsUseGeneratedSixDigitIds() {
        var room = CurPool.createRoom("room-a", "alice", "", false);

        assertThat(room).isPresent();
        assertThat(room.get().roomId()).matches("\\d{6}");
        assertThat(room.get().roomName()).isEqualTo("room-a");
        assertThat(CurPool.roomMembers(room.get().roomId())).containsExactly("alice");
    }

    @Test
    void createdRoomsKeepMembersIsolated() {
        String roomA = createPublicRoom("room-a", "alice");
        String roomB = createPublicRoom("room-b", "bob");

        assertThat(CurPool.roomMembers(roomA)).containsExactly("alice");
        assertThat(CurPool.roomMembers(roomB)).containsExactly("bob");
    }

    @Test
    void movingUserBetweenRoomsRemovesPreviousPresence() {
        String roomA = createPublicRoom("room-a", "alice");
        String roomB = createPublicRoom("room-b", "bob");
        CurPool.joinRoom(roomB, "alice", "");

        assertThat(CurPool.roomMembers(roomA)).isEmpty();
        assertThat(CurPool.roomMembers(roomB)).containsExactly("alice", "bob");
    }

    @Test
    void lateJoinerReceivesCurrentVideoSourceInSnapshot() {
        String roomA = createPublicRoom("room-a", "alice");
        CurPool.updateVideoSource(roomA, "alice", new VideoSourceState("https://example.com/a.mp4", "video/mp4"));

        RoomJoinResult result = CurPool.joinRoom(roomA, "bob", "");

        assertThat(result.snapshotOptional()).isPresent();
        assertThat(result.snapshot().videoSource().src()).isEqualTo("https://example.com/a.mp4");
    }

    @Test
    void onlyOwnerCanEditSourceAfterLock() {
        String roomA = createPublicRoom("room-a", "alice");
        CurPool.joinRoom(roomA, "bob", "");
        CurPool.setSourceLocked(roomA, "alice", true);

        assertThat(CurPool.updateVideoSource(roomA, "bob", new VideoSourceState("https://example.com/b.mp4", "video/mp4"))).isEmpty();
        assertThat(CurPool.updateVideoSource(roomA, "alice", new VideoSourceState("https://example.com/a.mp4", "video/mp4"))).isPresent();
    }

    @Test
    void passwordProtectedRoomRejectsWrongPassword() {
        String roomA = CurPool.createRoom("room-a", "alice", "secret", false).orElseThrow().roomId();

        assertThat(CurPool.joinRoom(roomA, "bob", "bad").errorCode()).isEqualTo("room_password_invalid");
        assertThat(CurPool.joinRoom(roomA, "bob", "secret").snapshotOptional()).isPresent();
    }

    @Test
    void hiddenRoomsAreNotListedPublicly() {
        CurPool.createRoom("room-a", "alice", "", true);

        assertThat(CurPool.roomSummaries()).isEmpty();
    }

    @Test
    void emptyCreatedRoomExpiresAfterTtl() throws Exception {
        setEmptyRoomTtlMillis(1L);
        String roomA = createPublicRoom("room-a", "alice");
        CurPool.leaveRoom("alice");

        Thread.sleep(5L);
        CurPool.purgeExpiredRooms();

        assertThat(CurPool.roomIds()).doesNotContain(roomA);
    }

    @Test
    void leavingWithoutRoomIsNoop() {
        assertThat(CurPool.leaveRoom("missing")).isEmpty();
    }

    private static String createPublicRoom(String roomName, String ownerId) {
        return CurPool.createRoom(roomName, ownerId, "", false).orElseThrow().roomId();
    }

    private static void setEmptyRoomTtlMillis(long ttlMillis) throws Exception {
        Field field = CurPool.class.getDeclaredField("emptyRoomTtlMillis");
        field.setAccessible(true);
        field.setLong(null, ttlMillis);
    }
}
