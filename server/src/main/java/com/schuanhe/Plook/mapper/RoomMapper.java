package com.schuanhe.Plook.mapper;

import com.schuanhe.Plook.entity.Room;
import com.schuanhe.Plook.entity.RoomChat;
import org.apache.ibatis.annotations.Mapper;
import org.springframework.stereotype.Component;

@Mapper
@Component
public interface RoomMapper {
    Room getRoomAndChatsById(Integer id);

    int addRoomChat(RoomChat roomChat);
}
