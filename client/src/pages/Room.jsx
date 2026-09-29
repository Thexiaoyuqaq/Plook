import { useEffect, useRef } from 'react'
import { Outlet, useMatch, useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'
import RoomSettingsDrawer from '../components/room/RoomSettingsDrawer'
import { useRoomStore } from '../store/roomStore'
import { socket } from '../lib/socket'
import { getSavedUserName } from '../lib/session'

export default function Room() {
  const navigate = useNavigate()
  const location = useLocation()
  const videoMatch = useMatch('/pc/video/:roomId')
  const routeRoomId = /^\d{6}$/.test(videoMatch?.params?.roomId || '') ? videoMatch.params.roomId : ''
  const autoJoinRef = useRef('')

  const socketStatus = useRoomStore((s) => s.socketStatus)
  const currentRoomId = useRoomStore((s) => s.currentRoomId)
  const disbandSeq = useRoomStore((s) => s.disbandSeq)
  const passwordPromptSeq = useRoomStore((s) => s.passwordPromptSeq)
  const roomErrorSeq = useRoomStore((s) => s.roomErrorSeq)

  // 进入 /pc 时确保已登录并建立（应用级持久）连接。
  useEffect(() => {
    const name = getSavedUserName()
    if (!name) {
      navigate('/', { replace: true })
      return
    }
    useRoomStore.getState().setUserName(name)
    socket.ensureConnected(name)
  }, [navigate])

  // 连接就绪且路由带房间号时自动加入；断开时重置标记，以便重连后自动重新加入。
  useEffect(() => {
    if (socketStatus !== 'open') {
      autoJoinRef.current = ''
      return
    }
    if (!routeRoomId || autoJoinRef.current === routeRoomId) return
    autoJoinRef.current = routeRoomId
    socket.joinRoom({ roomId: routeRoomId })
  }, [socketStatus, routeRoomId])

  // 进入房间后同步地址栏。
  useEffect(() => {
    if (!currentRoomId) {
      autoJoinRef.current = ''
      return
    }
    if (routeRoomId !== currentRoomId) navigate(`/pc/video/${currentRoomId}`, { replace: true })
  }, [currentRoomId, routeRoomId, navigate])

  // 房主解散：回到房间列表。
  useEffect(() => {
    if (!disbandSeq) return
    autoJoinRef.current = ''
    navigate('/pc/select-room', { replace: true })
  }, [disbandSeq, navigate])

  // 需要密码：回到列表页弹出密码框。
  useEffect(() => {
    if (!passwordPromptSeq) return
    autoJoinRef.current = ''
    if (!location.pathname.includes('/select-room')) {
      toast('该房间需要密码，请重新输入')
      navigate('/pc/select-room', { replace: true })
    }
  }, [passwordPromptSeq]) // eslint-disable-line react-hooks/exhaustive-deps

  // 加入失败（房间不存在/已解散/非法）：回到列表页。
  useEffect(() => {
    if (!roomErrorSeq) return
    const code = useRoomStore.getState().roomError?.code
    const fatal = ['room_not_found', 'not_in_room', 'invalid_room_id']
    if (fatal.includes(code) && !useRoomStore.getState().currentRoomId && !location.pathname.includes('/select-room')) {
      autoJoinRef.current = ''
      navigate('/pc/select-room', { replace: true })
    }
  }, [roomErrorSeq]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex flex-1 flex-col p-3 sm:p-4">
        <Outlet />
      </main>
      <Footer />
      <RoomSettingsDrawer />
    </div>
  )
}
