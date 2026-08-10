package com.schuanhe.Plook.mapper;

import com.schuanhe.Plook.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.springframework.stereotype.Component;

import java.util.List;

@Mapper
@Component
public interface UserMapper {
    User queryUserByUp(User user);

    List<User> queryUserList();

    int addUser(User user);

    List<User> queryUserByUserName(@Param("username") String username);
}
