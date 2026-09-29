package com.schuanhe.Plook.dto;

/**
 * WebSocket 消息类型常量。
 *
 * <p>顶层 {@code type} 区分消息大类，{@code data.type} 区分子事件。</p>
 */
public final class SocketTypes {
    public static final int ERROR = -1;

    // 顶层消息类型
    public static final int ROOM = 1;
    public static final int VIDEO = 2;
    public static final int CHAT = 3;
    public static final int HEARTBEAT = 4;

    // 房间事件 data.type
    public static final int ROOM_LIST = 0;
    public static final int ROOM_JOIN = 1;
    public static final int ROOM_LEAVE = 2;
    public static final int ROOM_CREATE = 3;
    public static final int ROOM_SNAPSHOT = 4;
    public static final int ROOM_LOCK_SOURCE = 5;
    public static final int ROOM_UPDATE_SETTINGS = 6;
    public static final int ROOM_DISBAND = 7;
    /** 服务端 → 房主：请求房主上报权威播放进度，用于给新加入者精确同步。 */
    public static final int ROOM_RESYNC_REQUEST = 8;
    /** 服务端 → 成员：成员在线状态变化（上线/离线/away）。 */
    public static final int ROOM_PRESENCE = 9;
    /** 服务端 → 客户端：房间需要密码（重连超出宽限期或首次加入密码房）。 */
    public static final int ROOM_PASSWORD_REQUIRED = 10;

    // 视频事件 data.type
    public static final int VIDEO_PLAYBACK = 0;
    public static final int VIDEO_SEEK = 1;
    public static final int VIDEO_SOURCE = 2;
    public static final int VIDEO_RATE = 3;
    /** 房主上报的权威播放状态；带 targetId 时只定向下发给该成员。 */
    public static final int VIDEO_SYNC = 4;
    /** 长按快进（2x）开始/结束：广播给房间，期间锁定其他成员操作。 */
    public static final int VIDEO_HOLD = 5;

    private SocketTypes() {
    }
}
