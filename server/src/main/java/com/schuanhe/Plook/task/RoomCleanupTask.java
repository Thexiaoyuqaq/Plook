package com.schuanhe.Plook.task;

import com.schuanhe.Plook.controller.WebSocket;
import com.schuanhe.Plook.service.SocketService;
import com.schuanhe.Plook.utils.CurPool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class RoomCleanupTask {

    @Scheduled(fixedDelayString = "${PLOOK_ROOM_CLEANUP_INTERVAL_MS:60000}")
    public void purgeExpiredRooms() {
        int removed = CurPool.purgeExpiredRooms().size();
        if (removed > 0) {
            log.info("purged {} expired rooms", removed);
            WebSocket.publish(SocketService.roomListChanged());
        }
    }
}
