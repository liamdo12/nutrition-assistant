import { Modal, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

interface CaptureBottomSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Bottom sheet with 3 circular capture buttons: Video, Photo, Audio */
export function CaptureBottomSheet({ visible, onClose }: CaptureBottomSheetProps) {
  const router = useRouter();

  const handleNavigate = (route: '/capture/record' | '/capture/photo' | '/capture/audio') => {
    onClose();
    router.push(route);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable className="flex-1" onPress={onClose} />

      {/* Sheet content */}
      <View className="bg-white rounded-t-3xl px-6 pt-6 pb-10">
        <Text className="text-lg font-semibold text-center mb-6">Capture</Text>

        <View className="flex-row justify-evenly">
          <CaptureOption
            label="Video"
            icon="🎥"
            onPress={() => handleNavigate('/capture/record')}
          />
          <CaptureOption
            label="Photo"
            icon="📷"
            onPress={() => handleNavigate('/capture/photo')}
          />
          <CaptureOption
            label="Audio"
            icon="🎙️"
            onPress={() => handleNavigate('/capture/audio')}
          />
        </View>
      </View>
    </Modal>
  );
}

interface CaptureOptionProps {
  label: string;
  icon: string;
  onPress: () => void;
}

function CaptureOption({ label, icon, onPress }: CaptureOptionProps) {
  return (
    <Pressable className="items-center" onPress={onPress}>
      <View className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center mb-2">
        <Text className="text-2xl">{icon}</Text>
      </View>
      <Text className="text-sm text-gray-700">{label}</Text>
    </Pressable>
  );
}
