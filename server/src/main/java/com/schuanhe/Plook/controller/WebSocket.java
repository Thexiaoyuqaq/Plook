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
import java.util.Objects;

@Slf4j
@Component
@ServerEndpoint("/websocket/{name}")
public class WebSocket {

    private Session session;
    private String name;
    private final Object sendLock = new Object();

    @OnOpen
    public void onOpen(Session session, @PathParam("name") String name) {
        this.session = session;
        this.name = name;
        CurPool.registerSocket(name, this);
        log.info("[socket-open] name={} session={} online={}", name, session.getId(), CurPool.onlineSocketCount());
        sendMessageList(SocketService.onOpen(name));
    }

    @OnClose
    public void onClose() {
        sendMessageList(SocketService.onClose(this.name));
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
        sendMessageList(SocketService.onMessage(message, name));
    }

    public void sendMessageList(SocketDispatch dispatch) {
        publish(dispatch);
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
                    try {
                        targetSession.close();
                    } catch (IOException closeError) {
                        log.debug("[socket-close-failed] target={}", targetName, closeError);
                    }
                }
            }
        }, () -> log.debug("[socket-send-skip] target={} reason=missing", targetName));
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
