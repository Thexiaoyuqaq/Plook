# Plook

Plook 是一个基于 WebSocket 的网页端一起看视频项目。用户可以创建 6 位数字房间、加入公开或私密房间，并在房间内同步视频源、播放状态、进度和聊天消息。

## 技术栈

前端：

- Vue 3.5
- Vite 7
- Pinia
- Vidstack
- vue-sonner
- virtua

后端：

- Java 17
- Spring Boot 3.5
- Jakarta WebSocket
- Actuator

当前后端房间、成员、视频源、播放状态和房间密码均为内存态。MySQL/MyBatis 旧链路已移除，服务启动和健康检查不再依赖数据库。

## 目录

```text
client/  Vue 前端
server/  Spring Boot 后端
```

## 本地运行

后端：

```bash
cd server
mvn spring-boot:run
```

默认端口：`1999`

前端：

```bash
cd client
cnpm install
cnpm run dev
```

默认端口：`5173`

## WebSocket

连接地址：

```text
/websocket/{name}
```

消息通用结构：

```json
{
  "type": 1,
  "data": {},
  "roomId": "123456",
  "ownerId": "alice",
  "sentAt": 1720000000000
}
```

消息类型：

| type | 含义 |
| --- | --- |
| 1 | 房间事件 |
| 2 | 视频事件 |
| 3 | 聊天事件 |
| 4 | 心跳 |

房间事件 `data.type`：

| data.type | 含义 |
| --- | --- |
| -1 | 错误 |
| 0 | 房间列表 |
| 1 | 加入房间 |
| 2 | 离开房间 |
| 3 | 创建房间 |
| 4 | 房间快照 |
| 5 | 锁定视频源 |
| 6 | 更新房间设置 |

视频事件 `data.type`：

| data.type | 含义 |
| --- | --- |
| 0 | 播放/暂停 |
| 1 | 跳转进度 |
| 2 | 切换视频源 |


