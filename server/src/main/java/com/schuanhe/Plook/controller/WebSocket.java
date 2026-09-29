package com.schuanhe.Plook.controller;

import com.schuanhe.Plook.dto.SocketDispatch;
import com.schuanhe.Plook.service.SocketService;
import com.schuanhe.Plook.utils.CurPool;
import jakarta.websocket.OnClose;
import jakarta.websocket.OnError;
import jakarta.websocket.OnMessage;
import jakarta.websocket.OnOpen;
import jakarta.websocket.Session;
import jakarta.websocket.server.PathParam;
import jakarta.websocket.server.ServerEndpoint;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.EOFException;
import java.io.IOException;
import java.net.SocketException;
import java.nio.channels.ClosedChannelException;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Component
@ServerEndpoint("/websocket/{name}")
public class WebSocket {

    private Session session;
    private String name;
    private String sid;
    private final Object sendLock = new Object();

    @OnOpen
    public void onOpen(Session session, @PathParam("name") String name) {
        this.session = session;
        this.name = name;
        this.sid = firstParam(session, "sid");
        CurPool.registerSocket(name, this);
        log.info("[socket-open] name={} sid={} session={} online={}", name, sid, session.getId(), CurPool.onlineSocketCount());
        publish(SocketService.onOpen(name, sid));
    }

    @OnClose
    public void onClose() {
        // 仅当自己仍是该昵称的当前连接时才触发断线处理，避免被顶替的旧连接误退房。
        if (CurPool.removeSocketIfCurrent(this.name, this)) {
            publish(SocketService.onDisconnect(this.name, this.sid));
        }
        log.info("[socket-close] name={} online={}", name, CurPool.onlineSocketCount());
    }

    @OnError
    public void onError(Throwable throwable) {
        if (isExpectedDisconnect(throwable)) {
            log.debug("[socket-disconnect] name={} session={} reason={}", name, session == null ? null : session.getId(), throwable.getClass().getSimpleName());
            return;
        }
        log.warn("[socket-error] name={} session={}", name, session == null ? null : session.getId(), throwable);
    }

    @OnMessage
    public void onMessage(String message) {
        log.debug("[socket-message] name={} payload={}", name, message);
        publish(SocketService.onMessage(message, name));
    }

    public String sid() {
        return sid;
    }

    public boolean isOpen() {
        return session != null && session.isOpen();
    }

    public void closeQuietly() {
        try {
            if (session != null && session.isOpen()) {
                session.close();
            }
        } catch (IOException ex) {
            log.debug("[socket-close-failed] name={}", name, ex);
        }
    }

    public static void publish(SocketDispatch dispatch) {
        if (dispatch == null) {
            return;
        }

        if (dispatch.hasPayload()) {
            dispatch.names().stream()
                    .filter(Objects::nonNull)
                    .filter(targetName -> dispatch.ownerId() == null || !dispatch.ownerId().equals(targetName))
                    .forEach(targetName -> sendMessage(targetName, dispatch.data()));
        }

        dispatch.followUps().forEach(WebSocket::publish);
    }

    public static void sendMessage(String targetName, String message) {
        CurPool.findSocket(targetName).ifPresentOrElse(socket -> {
            Session targetSession = socket.session;
            if (targetSession == null || !targetSession.isOpen()) {
                log.debug("[socket-send-skip] target={} reason=closed", targetName);
                return;
            }
            synchronized (socket.sendLock) {
                try {
                    targetSession.getBasicRemote().sendText(message);
                } catch (IOException | IllegalStateException ex) {
                    log.warn("[socket-send-failed] target={} message={}", targetName, ex.getMessage());
                    socket.closeQuietly();
                }
            }
        }, () -> log.debug("[socket-send-skip] target={} reason=missing", targetName));
    }

    private static String firstParam(Session session, String key) {
        Map<String, List<String>> params = session.getRequestParameterMap();
        if (params == null) {
            return null;
        }
        List<String> values = params.get(key);
        return values == null || values.isEmpty() ? null : values.get(0);
    }

    private static boolean isExpectedDisconnect(Throwable throwable) {
        for (Throwable cause = throwable; cause != null; cause = cause.getCause()) {
            if (cause instanceof EOFException || cause instanceof ClosedChannelException || cause instanceof SocketException) {
                return true;
            }
        }
        return false;
    }
}
