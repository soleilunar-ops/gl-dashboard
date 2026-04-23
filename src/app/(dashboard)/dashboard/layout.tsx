import { AudioPlayerProvider } from "@/contexts/AudioPlayerContext";
import { DemoDataProvider } from "@/lib/demo";
import { AudioMiniPlayer } from "@/components/weekly-brief/AudioMiniPlayer";
import "./dashboard.css";

// /dashboard 는 (dashboard) 그룹 안에 있으므로 상위 layout의 Sidebar + Header 자동 상속.
// 여기서는 데모 데이터 + 오디오 플레이어 Provider만 래핑.
export default function DashboardSubLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoDataProvider>
      <AudioPlayerProvider>
        {children}
        <AudioMiniPlayer />
      </AudioPlayerProvider>
    </DemoDataProvider>
  );
}
