import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

export type CaptureMode = 'camera' | 'voice';

const MODES: { key: CaptureMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'camera', label: 'Camera', icon: 'camera-outline' },
  { key: 'voice', label: 'Voice', icon: 'mic-outline' },
];

const ROUTE_MAP: Record<CaptureMode, string> = {
  camera: '/capture/photo',
  voice: '/capture/audio',
};

interface ModeTogglePillProps {
  activeMode: CaptureMode;
}

export function ModeTogglePill({ activeMode }: ModeTogglePillProps) {
  const router = useRouter();

  const handlePress = (mode: CaptureMode) => {
    if (mode === activeMode) return;
    router.replace(ROUTE_MAP[mode] as never);
  };

  return (
    <BlurView
      intensity={40}
      tint="dark"
      className="flex-row rounded-full overflow-hidden"
      style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
    >
      {MODES.map(({ key, label, icon }) => {
        const isActive = key === activeMode;
        return (
          <Pressable
            key={key}
            onPress={() => handlePress(key)}
            className="flex-row items-center gap-2 px-5 py-2.5 rounded-full"
            style={isActive ? { backgroundColor: 'rgba(255,255,255,0.25)' } : undefined}
          >
            <Ionicons name={icon} size={18} color="white" />
            <Text className="text-white text-base font-medium">{label}</Text>
          </Pressable>
        );
      })}
    </BlurView>
  );
}
