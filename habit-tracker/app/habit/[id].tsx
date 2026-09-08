import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HabitFormModal } from "@/components/HabitFormModal";
import { ThirtyDayGrid } from "@/components/ThirtyDayGrid";
import { useHabits } from "@/context/HabitContext";
import { useColors } from "@/hooks/useColors";

const FREQ_LABEL: Record<string, string> = {
  daily: "Every day",
  "3x_week": "Mon, Wed, Fri",
  "5x_week": "Weekdays",
  weekdays: "Mon – Fri",
};

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { habits, deleteHabit, getStreak, getLongestStreak, toggleCompletion, isCompleted } = useHabits();
  const [showEdit, setShowEdit] = useState(false);

  const habit = habits.find((h) => h.id === id);
  const webTop = Platform.OS === "web" ? 67 : 0;

  if (!habit) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.notFound, { paddingTop: insets.top + webTop + 24 }]}>
          <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>Habit not found.</Text>
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const streak = getStreak(habit.id);
  const longest = getLongestStreak(habit.id);
  const today = new Date().toISOString().split("T")[0]!;
  const done = isCompleted(habit.id, today);

  const handleDelete = () => {
    if (Platform.OS === "web") {
      if (confirm(`Delete "${habit.name}"?`)) {
        deleteHabit(habit.id);
        router.back();
      }
    } else {
      Alert.alert("Delete Habit", `Delete "${habit.name}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteHabit(habit.id);
            router.back();
          },
        },
      ]);
    }
  };

  const handleToggleToday = async () => {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    }
    toggleCompletion(habit.id, today);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + webTop + 16, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.navRow}>
          <Pressable onPress={() => router.back()} style={[styles.navBtn, { backgroundColor: colors.card }]}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <View style={styles.navActions}>
            <Pressable onPress={() => setShowEdit(true)} style={[styles.navBtn, { backgroundColor: colors.card }]}>
              <Feather name="edit-2" size={18} color={colors.primary} />
            </Pressable>
            <Pressable onPress={handleDelete} style={[styles.navBtn, { backgroundColor: colors.destructive + "22" }]}>
              <Feather name="trash-2" size={18} color={colors.destructive} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.heroCard, { backgroundColor: habit.color + "18" }]}>
          <View style={[styles.heroIcon, { backgroundColor: habit.color + "33" }]}>
            <Text style={styles.heroEmoji}>{habit.icon}</Text>
          </View>
          <Text style={[styles.heroName, { color: colors.foreground }]}>{habit.name}</Text>
          <Text style={[styles.heroFreq, { color: colors.mutedForeground }]}>{FREQ_LABEL[habit.frequency]}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 22 }}>🔥</Text>
            <Text style={[styles.statNum, { color: colors.streakOrange }]}>{streak}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Current</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="award" size={22} color={colors.primary} />
            <Text style={[styles.statNum, { color: colors.primary }]}>{longest}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Best</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="check-circle" size={22} color={colors.success} />
            <Text style={[styles.statNum, { color: colors.success }]}>{habit.completions.length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total</Text>
          </View>
        </View>

        <Pressable
          onPress={handleToggleToday}
          style={({ pressed }) => [
            styles.todayBtn,
            {
              backgroundColor: done ? habit.color : colors.card,
              borderColor: done ? habit.color : colors.border,
              opacity: pressed ? 0.88 : 1,
            },
          ]}
        >
          <Feather
            name={done ? "check-circle" : "circle"}
            size={22}
            color={done ? "#fff" : colors.mutedForeground}
          />
          <Text style={[styles.todayBtnText, { color: done ? "#fff" : colors.foreground }]}>
            {done ? "Completed today!" : "Mark today as done"}
          </Text>
        </Pressable>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>30-Day History</Text>
          <ThirtyDayGrid habit={habit} />
        </View>
      </ScrollView>

      <HabitFormModal visible={showEdit} onClose={() => setShowEdit(false)} editHabit={habit} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16 },
  notFound: { flex: 1, alignItems: "center", gap: 12, paddingHorizontal: 20 },
  notFoundText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  backBtn: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  backBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold" },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  navActions: { flexDirection: "row", gap: 8 },
  heroCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroEmoji: { fontSize: 34 },
  heroName: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  heroFreq: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statNum: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  todayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
    marginBottom: 14,
  },
  todayBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 16,
  },
});
