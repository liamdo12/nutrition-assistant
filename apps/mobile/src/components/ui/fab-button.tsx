import { Pressable, Text } from 'react-native';

interface FabButtonProps {
  onPress: () => void;
}

/** Floating action button centered above the tab bar */
export function FabButton({ onPress }: FabButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Open capture menu"
      accessibilityRole="button"
      className="absolute bottom-20 self-center w-14 h-14 rounded-full bg-green-500 items-center justify-center"
      style={{
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      }}
    >
      <Text className="text-white text-2xl font-bold">+</Text>
    </Pressable>
  );
}
