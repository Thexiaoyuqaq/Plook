import { useIsMobile } from '../hooks/useMediaQuery'
import VideoPlayer from '../components/player/VideoPlayer'
import ChatPanel from '../components/room/ChatPanel'

export default function Watch() {
  const isMobile = useIsMobile()

  if (isMobile) {
    // 手机：视频在上、聊天固定高度且内部滚动；页面整体可上下滚动，输入框始终可达。
    return (
      <section className="flex flex-col gap-3">
        <VideoPlayer />
        <div className="min-h-0" style={{ height: '65vh' }}>
          <ChatPanel />
        </div>
      </section>
    )
  }

  return (
    <section
      className="mx-auto grid w-full gap-4"
      style={{
        maxWidth: 1280,
        gridTemplateColumns: 'minmax(0,1fr) minmax(300px, 360px)',
        height: 'calc(100dvh - 150px)',
      }}
    >
      <VideoPlayer />
      <div className="min-h-0">
        <ChatPanel />
      </div>
    </section>
  )
}
