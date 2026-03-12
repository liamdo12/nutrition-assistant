import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { useEffect } from 'react';

const ORB_SIZE = 180;

interface AnimatedOrbProps {
  /** Audio meter level 0-1, drives pulse intensity when recording */
  meterLevel?: number;
  /** Whether currently recording */
  isRecording?: boolean;
}

export function AnimatedOrb({ meterLevel = 0, isRecording = false }: AnimatedOrbProps) {
  const rotationProgress = useSharedValue(0);
  const pulseProgress = useSharedValue(0);
  const highlightShift = useSharedValue(0);
  const meterShared = useSharedValue(0);

  // Sync JS props to shared values for worklet access
  useEffect(() => {
    meterShared.value = isRecording ? meterLevel : 0;
  }, [meterLevel, isRecording, meterShared]);

  useEffect(() => {
    // Slow continuous rotation for highlight movement (8s cycle)
    rotationProgress.value = withRepeat(
      withTiming(1, { duration: 8000, easing: Easing.linear }),
      -1,
      false,
    );
    // Breathing pulse (3s cycle)
    pulseProgress.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    // Highlight color shift (6s cycle)
    highlightShift.value = withRepeat(
      withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [rotationProgress, pulseProgress, highlightShift]);

  // Scale: base breathing + audio reactivity boost
  const animatedScale = useAnimatedStyle(() => {
    const baseScale = interpolate(pulseProgress.value, [0, 1], [0.97, 1.03]);
    const audioBoost = meterShared.value * 0.06;
    return { transform: [{ scale: baseScale + audioBoost }] };
  });

  // Rotating highlight layer 1 (slower)
  const animatedHighlight1 = useAnimatedStyle(() => {
    const rotate = interpolate(rotationProgress.value, [0, 1], [0, 360]);
    const opacity = interpolate(highlightShift.value, [0, 1], [0.3, 0.7]);
    return {
      transform: [{ rotate: `${rotate}deg` }],
      opacity,
    };
  });

  // Rotating highlight layer 2 (counter-direction)
  const animatedHighlight2 = useAnimatedStyle(() => {
    const rotate = interpolate(rotationProgress.value, [0, 1], [180, -180]);
    const opacity = interpolate(highlightShift.value, [0, 1], [0.5, 0.25]);
    return {
      transform: [{ rotate: `${rotate}deg` }],
      opacity,
    };
  });

  // Specular highlight position drift
  const animatedSpecular = useAnimatedStyle(() => {
    const tx = interpolate(rotationProgress.value, [0, 0.5, 1], [-15, 15, -15]);
    const ty = interpolate(rotationProgress.value, [0, 0.5, 1], [-5, 10, -5]);
    return {
      transform: [{ translateX: tx }, { translateY: ty }],
    };
  });

  // Outer glow pulse
  const animatedGlow = useAnimatedStyle(() => {
    const opacity = interpolate(pulseProgress.value, [0, 1], [0.3, 0.6]);
    const scale = interpolate(pulseProgress.value, [0, 1], [1, 1.1]);
    return { opacity, transform: [{ scale }] };
  });

  return (
    <Animated.View style={[styles.container, animatedScale]}>
      {/* Outer glow ring */}
      <Animated.View style={[styles.outerGlow, animatedGlow]} />

      {/* Base sphere gradient */}
      <LinearGradient
        colors={['#1a0533', '#2d1b69', '#0f0a2e']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={styles.baseSphere}
      />

      {/* Highlight layer 1: purple-blue sweep */}
      <Animated.View style={[styles.highlightLayer, animatedHighlight1]}>
        <LinearGradient
          colors={['rgba(138, 80, 255, 0.6)', 'transparent', 'rgba(60, 20, 180, 0.3)']}
          start={{ x: 0, y: 0.2 }}
          end={{ x: 1, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Highlight layer 2: blue-teal accent */}
      <Animated.View style={[styles.highlightLayer, animatedHighlight2]}>
        <LinearGradient
          colors={['transparent', 'rgba(100, 140, 255, 0.4)', 'transparent']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Specular highlight (bright spot) */}
      <Animated.View style={[styles.specular, animatedSpecular]}>
        <LinearGradient
          colors={['rgba(200, 180, 255, 0.7)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerGlow: {
    position: 'absolute',
    width: ORB_SIZE + 40,
    height: ORB_SIZE + 40,
    borderRadius: (ORB_SIZE + 40) / 2,
    backgroundColor: 'rgba(100, 50, 200, 0.15)',
  },
  baseSphere: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: ORB_SIZE / 2,
    overflow: 'hidden',
  },
  highlightLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: ORB_SIZE / 2,
    overflow: 'hidden',
  },
  specular: {
    position: 'absolute',
    top: 15,
    left: 30,
    width: 60,
    height: 40,
    borderRadius: 30,
    overflow: 'hidden',
  },
});
