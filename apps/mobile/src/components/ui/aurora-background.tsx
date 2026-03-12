import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';

const COLORS = {
  bg: '#0a0a0f',
  purpleCore: 'rgba(120, 50, 200, 0.45)',
  purpleMid: 'rgba(80, 30, 160, 0.2)',
  transparent: 'rgba(0, 0, 0, 0)',
};

export function AuroraBackground({ children }: { children: React.ReactNode }) {
  const glowOpacity = useSharedValue(0.6);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1, // infinite
      true, // reverse
    );
  }, [glowOpacity]);

  const animatedGlow = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.bg }]}>
      {/* Primary purple glow blob */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: -80,
            left: '15%',
            width: 300,
            height: 300,
            borderRadius: 150,
            overflow: 'hidden',
          },
          animatedGlow,
        ]}
      >
        <LinearGradient
          colors={[COLORS.purpleCore, COLORS.purpleMid, COLORS.transparent]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.3 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>

      {/* Secondary accent glow */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 40,
          right: '10%',
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: 'rgba(100, 40, 180, 0.15)',
        }}
      />

      {children}
    </View>
  );
}
