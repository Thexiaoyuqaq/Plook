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
| 7 | 解散房间（房主） |
| 8 | 请求房主上报进度（服务端→房主，用于给新成员精确同步） |
| 9 | 在线状态变化 |
| 10 | 需要密码（重连超出宽限期或密码错误） |

视频事件 `data.type`：

| data.type | 含义 |
| --- | --- |
| 0 | 播放/暂停 |
| 1 | 跳转进度 |
| 2 | 切换视频源 |
| 3 | 倍速变化 |
| 4 | 房主权威同步（可带 `targetId` 定向下发） |

## 连接与会话

- WebSocket 连接地址带上客户端持久化的会话标识：`/websocket/{name}?sid={sid}`。`sid` 存于浏览器 `localStorage`，用于刷新/重连后识别同一客户端。
- 断线不会立即退房：成员在“重连宽限期”（默认 6 分钟，`PLOOK_RECONNECT_GRACE_SECONDS`）内保留房间成员身份并显示为离线；用相同 `sid` 重连即可无需重新验证密码恢复会话（解决刷新/手机切后台掉线、密码房重连报错等问题）。
- 每个活跃房间在内存中保留最近 50 条聊天与系统消息，新加入/重连的成员会在加入快照中一次性收到历史。
- 新成员加入时，服务端会请求房主上报当前播放进度，结合视频源与播放状态定向下发给该成员，保证后进者进度准确。


