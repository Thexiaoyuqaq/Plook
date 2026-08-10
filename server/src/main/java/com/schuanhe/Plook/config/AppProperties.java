package com.schuanhe.Plook.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "app")
public record AppProperties(Cors cors, Rooms rooms) {
    public record Cors(List<String> allowedOriginPatterns) {
    }

    public record Rooms(boolean allowCreate, long emptyDisbandMinutes) {
    }
}
