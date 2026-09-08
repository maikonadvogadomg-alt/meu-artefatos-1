import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useHabits } from "@/context/HabitContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  habitId: string;
  today: string;
}

const FREQ_LABEL: Record<string, string> = {
  daily: "Every day",
  "3x_week": "3x per week",
  "5x_week": "5x per week",
  weekdays: "Weekdays",
};

export function HabitCard({ habitId, today }: Props) {
  const colors = useColors();
  const { habits, toggleCompletion, isCompleted, getStreak } = useHabits();
  const habit = habits.find((h) => h.id === habitId);
  if (!habit) return null;

  const done = isCompleted(habitId, today);
  const streak = getStreak(habitId);

  const handleToggle = useCallback(async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(
        done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
      );
    }
    toggleCompletion(habitId, today);
  }, [habitId, today, done, toggleCompletion]);

  const handlePress = useCallback(() => {
    router.push(`/habit/${habitId}`);
  }, [habitId]);

  const getLast7 = () => {
    const days: { date: string; done: boolean; isToday: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0]!;
      days.push({
        date: dateStr,
        done: habit.completions.includes(dateStr),
        isToday: dateStr === today,
      });
    }
    return days;
  };

  const last7 = getLast7();

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: done ? habit.color : colors.border,
          borderWidth: done ? 1.5 : 1,
          opacity: pressed ? 0.92 : 1,
          shadowColor: habit.color,
          shadowOpacity: done ? 0.18 : 0.05,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: done ? 4 : 2,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.leftGroup}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: habit.color + "22" },
            ]}
          >
            <Text style={styles.iconText}>{habit.icon}</Text>
          </View>
          <View style={styles.nameGroup}>
            <Text
              style={[styles.habitName, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {habit.name}
            </Text>
            <Text style={[styles.freqLabel, { color: colors.mutedForeground }]}>
              {FREQ_LABEL[habit.frequency] ?? habit.frequency}
            </Text>
          </View>
        </View>
        <View style={styles.rightGroup}>
          {streak > 0 && (
            <View style={[styles.streakBadge, { backgroundColor: colors.streakOrange + "22" }]}>
              <Text style={[styles.streakFire, { color: colors.streakOrange }]}>
                🔥 {streak}
              </Text>
            </View>
          )}
          <Pressable
            onPress={handleToggle}
            style={({ pressed }) => [
              styles.checkButton,
              {
                backgroundColor: done ? habit.color : colors.secondary,
                transform: [{ scale: pressed ? 0.9 : 1 }],
              },
            ]}
            hitSlop={8}
          >
            <Text style={styles.checkMark}>{done ? "✓" : ""}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.miniGrid}>
        {last7.map((day) => (
          <View
            key={day.date}
            style={[
              styles.miniDot,
              {
                backgroundColor: day.done
                  ? habit.color
                  : day.isToday
                  ? habit.color + "44"
                  : colors.gridEmpty,
                borderWidth: day.isToday ? 1.5 : 0,
                borderColor: day.isToday ? habit.color : "transparent",
              },
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 22,
  },
  nameGroup: {
    flex: 1,
    gap: 2,
  },
  habitName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  freqLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  streakBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  streakFire: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  checkButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  miniGrid: {
    flexDirection: "row",
    gap: 6,
  },
  miniDot: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
});
