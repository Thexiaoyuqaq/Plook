package com.schuanhe.Plook.dto;

public final class SocketTypes {
    public static final int ERROR = -1;

    public static final int ROOM = 1;
    public static final int VIDEO = 2;
    public static final int CHAT = 3;
    public static final int HEARTBEAT = 4;

    public static final int ROOM_LIST = 0;
    public static final int ROOM_JOIN = 1;
    public static final int ROOM_LEAVE = 2;
    public static final int ROOM_CREATE = 3;
    public static final int ROOM_SNAPSHOT = 4;
    public static final int ROOM_LOCK_SOURCE = 5;
    public static final int ROOM_UPDATE_SETTINGS = 6;

    public static final int VIDEO_PLAYBACK = 0;
    public static final int VIDEO_SEEK = 1;
    public static final int VIDEO_SOURCE = 2;

    private SocketTypes() {
    }
}
