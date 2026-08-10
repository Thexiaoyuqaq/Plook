package com.schuanhe.Plook.model;

public record VideoSourceState(String src, String type) {
    public boolean hasSource() {
        return src != null && !src.isBlank();
    }
}
