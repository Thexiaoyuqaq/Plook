package com.schuanhe.Plook.model;

import java.util.List;

/**
 * 下发给客户端的房间快照。
 *
 * <p>{@code members} 携带每个成员的在线状态；{@code history} 仅在加入/重连快照中非空，
 * 用于一次性回填聊天与系统消息，普通状态快照该字段为 {@code null} 以避免重复。</p>
 */
public record RoomSnapshot(
        String roomId,
        String roomName,
        String ownerId,
        boolean owner,
        boolean sourceLocked,
        boolean hidden,
        boolean hasPassword,
        List<MemberInfo> members,
        VideoSourceState videoSource,
        PlaybackState playback,
        List<ChatLogEntry> history,
        Long emptySince,
        long createdAt
) {
}
