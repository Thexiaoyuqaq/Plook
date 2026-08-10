package com.schuanhe.Plook.service.impl;

import com.schuanhe.Plook.entity.User;
import com.schuanhe.Plook.mapper.UserMapper;
import com.schuanhe.Plook.service.UserService;
import org.springframework.stereotype.Service;

import java.util.List;

@Service("UserService")
public class UserServiceImpl implements UserService {

    private final UserMapper userMapper;

    public UserServiceImpl(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    @Override
    public User Login(User user) {
        return userMapper.queryUserByUp(user);
    }

    @Override
    public User Register(User user) {
        if (userMapper.queryUserByUp(user) != null) {
            return user;
        }
        userMapper.addUser(user);
        return user;
    }

    @Override
    public List<User> queryUserList() {
        return userMapper.queryUserList();
    }
}
