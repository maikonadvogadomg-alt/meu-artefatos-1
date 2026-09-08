import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  week: string;
  completed: number;
  total: number;
  color?: string;
  delay?: number;
}

export function WeeklyProgressBar({ week, completed, total, color, delay = 0 }: Props) {
  const colors = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  const rate = total > 0 ? completed / total : 0;
  const pct = Math.round(rate * 100);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: rate,
      duration: 600,
      delay,
      useNativeDriver: false,
    }).start();
  }, [rate]);

  const barColor = color ?? colors.primary;
  const rateColor =
    pct >= 80 ? colors.success : pct >= 50 ? colors.warning : colors.destructive;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.weekLabel, { color: colors.foreground }]}>{week}</Text>
        <View style={styles.metaRow}>
          <Text style={[styles.fraction, { color: colors.mutedForeground }]}>
            {completed}/{total}
          </Text>
          <Text style={[styles.pct, { color: rateColor }]}>{pct}%</Text>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: colors.secondary }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: barColor,
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  weekLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fraction: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  pct: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
  },
});
