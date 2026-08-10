package com.schuanhe.Plook.dto;

import java.util.List;

public record SocketDispatch(List<String> names, String data, String ownerId, List<SocketDispatch> followUps) {
    public SocketDispatch {
        names = names == null ? List.of() : List.copyOf(names);
        followUps = followUps == null ? List.of() : List.copyOf(followUps);
    }

    public static SocketDispatch empty() {
        return new SocketDispatch(List.of(), null, null, List.of());
    }

    public static SocketDispatch of(List<String> names, String data, String ownerId) {
        return new SocketDispatch(names, data, ownerId, List.of());
    }

    public static SocketDispatch of(List<String> names, String data, String ownerId, List<SocketDispatch> followUps) {
        return new SocketDispatch(names, data, ownerId, followUps);
    }

    public SocketDispatch withFollowUps(List<SocketDispatch> next) {
        return new SocketDispatch(names, data, ownerId, next);
    }

    public boolean hasPayload() {
        return data != null && !data.isBlank() && !names.isEmpty();
    }
}
