package com.schuanhe.Plook.utils;

import com.schuanhe.Plook.model.ChatLogEntry;
import com.schuanhe.Plook.model.RoomJoinResult;
import com.schuanhe.Plook.model.RoomSnapshot;
import com.schuanhe.Plook.model.RoomState;
import com.schuanhe.Plook.model.VideoSourceState;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class CurPoolTest {

    @BeforeEach
    void setUp() {
        CurPool.reset(10L);
    }

    @Test
    void createdRoomsUseGeneratedSixDigitIds() {
        var room = CurPool.createRoom("room-a", "alice", null, "", false);

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
        CurPool.joinRoom(roomB, "alice", null, "");

        assertThat(CurPool.roomMembers(roomA)).isEmpty();
        assertThat(CurPool.roomMembers(roomB)).containsExactly("alice", "bob");
    }

    @Test
    void lateJoinerReceivesCurrentVideoSourceInSnapshot() {
        String roomA = createPublicRoom("room-a", "alice");
        CurPool.updateVideoSource(roomA, "alice", new VideoSourceState("https://example.com/a.mp4", "video/mp4"));

        RoomJoinResult result = CurPool.joinRoom(roomA, "bob", null, "");

        assertThat(result.snapshotOptional()).isPresent();
        assertThat(result.snapshot().videoSource().src()).isEqualTo("https://example.com/a.mp4");
    }

    @Test
    void onlyOwnerCanEditSourceAfterLock() {
        String roomA = createPublicRoom("room-a", "alice");
        CurPool.joinRoom(roomA, "bob", null, "");
        CurPool.setSourceLocked(roomA, "alice", true);

        assertThat(CurPool.updateVideoSource(roomA, "bob", new VideoSourceState("https://example.com/b.mp4", "video/mp4"))).isEmpty();
        assertThat(CurPool.updateVideoSource(roomA, "alice", new VideoSourceState("https://example.com/a.mp4", "video/mp4"))).isPresent();
    }

    @Test
    void passwordProtectedRoomRejectsWrongPassword() {
        String roomA = CurPool.createRoom("room-a", "alice", null, "secret", false).orElseThrow().roomId();

        assertThat(CurPool.joinRoom(roomA, "bob", null, "bad").errorCode()).isEqualTo("room_password_invalid");
        assertThat(CurPool.joinRoom(roomA, "bob", null, "secret").snapshotOptional()).isPresent();
    }

    @Test
    void hiddenRoomsAreNotListedPublicly() {
        CurPool.createRoom("room-a", "alice", null, "", true);

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

    @Test
    void existingMemberRejoinsPasswordRoomWithoutPassword() {
        String roomId = CurPool.createRoom("room-a", "alice", "s-alice", "secret", false).orElseThrow().roomId();
        CurPool.joinRoom(roomId, "bob", "s-bob", "secret");

        // 已是成员：即使不再提供密码也能重新加入（刷新/重连场景）。
        assertThat(CurPool.joinRoom(roomId, "bob", "s-bob", "").snapshotOptional()).isPresent();
    }

    @Test
    void resumeRestoresPasswordRoomForSameSidOnly() {
        String roomId = CurPool.createRoom("room-a", "alice", "s-alice", "secret", false).orElseThrow().roomId();

        assertThat(CurPool.resume("alice", "s-alice").map(RoomSnapshot::roomId)).contains(roomId);
        assertThat(CurPool.resume("alice", "different-sid")).isEmpty();
        assertThat(CurPool.resume("stranger", "whatever")).isEmpty();
    }

    @Test
    void ownerCanDisbandRoomAndMembersAreDetached() {
        String roomId = createPublicRoom("room-a", "alice");
        CurPool.joinRoom(roomId, "bob", null, "");

        assertThat(CurPool.disbandRoom(roomId, "bob")).isEmpty();

        Optional<java.util.List<String>> members = CurPool.disbandRoom(roomId, "alice");
        assertThat(members).isPresent();
        assertThat(members.get()).containsExactlyInAnyOrder("alice", "bob");
        assertThat(CurPool.roomIds()).doesNotContain(roomId);
        assertThat(CurPool.currentRoomId("bob")).isEmpty();
    }

    @Test
    void playbackRateIsPersistedInSnapshot() {
        String roomId = createPublicRoom("room-a", "alice");

        RoomSnapshot snapshot = CurPool.updatePlayback(roomId, "alice", false, 12d, 1.5d).orElseThrow();

        assertThat(snapshot.playback().rate()).isEqualTo(1.5d);
        assertThat(snapshot.playback().currentTime()).isEqualTo(12d);
    }

    @Test
    void historyIsCappedAndReturnedInJoinSnapshot() {
        String roomId = createPublicRoom("room-a", "alice");
        for (int i = 0; i < 60; i++) {
            CurPool.appendHistory(roomId, new ChatLogEntry("id-" + i, "chat", "alice", "msg-" + i, i));
        }

        RoomSnapshot snapshot = CurPool.joinRoom(roomId, "bob", null, "").snapshot();
        assertThat(snapshot.history()).hasSize(RoomState.HISTORY_LIMIT);
        assertThat(snapshot.history().get(snapshot.history().size() - 1).text()).isEqualTo("msg-59");
    }

    private static String createPublicRoom(String roomName, String ownerId) {
        return CurPool.createRoom(roomName, ownerId, null, "", false).orElseThrow().roomId();
    }

    private static void setEmptyRoomTtlMillis(long ttlMillis) throws Exception {
        Field field = CurPool.class.getDeclaredField("emptyRoomTtlMillis");
        field.setAccessible(true);
        field.setLong(null, ttlMillis);
    }
}
