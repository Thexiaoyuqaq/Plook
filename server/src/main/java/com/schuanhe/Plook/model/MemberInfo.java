package com.schuanhe.Plook.model;

/**
 * 房间成员在线状态。{@code online=false} 表示成员仍在房间内但当前连接已断开
 * （处于重连宽限期，例如手机切后台或刷新页面）。
 */
public record MemberInfo(String name, boolean online, boolean owner) {
}
