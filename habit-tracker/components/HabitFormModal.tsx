import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Frequency, Habit, useHabits } from "@/context/HabitContext";
import { useColors } from "@/hooks/useColors";

const ICONS = [
  "💪", "🏃", "📚", "💧", "🧘", "🥗", "😴", "✍️",
  "🎯", "🎵", "🌿", "🏋️", "🚴", "🧠", "🌅", "🫁",
  "🍎", "☕", "🫶", "🌊",
];

const COLORS = [
  "#6c63ff", "#f97316", "#10b981", "#3b82f6",
  "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444",
  "#f59e0b", "#84cc16",
];

const FREQ_OPTIONS: { value: Frequency; label: string; desc: string }[] = [
  { value: "daily", label: "Daily", desc: "Every day" },
  { value: "3x_week", label: "3x / week", desc: "Mon, Wed, Fri" },
  { value: "5x_week", label: "5x / week", desc: "Weekdays" },
  { value: "weekdays", label: "Weekdays", desc: "Mon – Fri" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  editHabit?: Habit;
}

export function HabitFormModal({ visible, onClose, editHabit }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addHabit, updateHabit } = useHabits();

  const [name, setName] = useState(editHabit?.name ?? "");
  const [icon, setIcon] = useState(editHabit?.icon ?? ICONS[0]!);
  const [color, setColor] = useState(editHabit?.color ?? COLORS[0]!);
  const [frequency, setFrequency] = useState<Frequency>(editHabit?.frequency ?? "daily");
  const [reminderEnabled, setReminderEnabled] = useState(editHabit?.reminderEnabled ?? false);
  const [reminderHour, setReminderHour] = useState(editHabit?.reminderHour ?? 8);
  const [reminderMinute, setReminderMinute] = useState(editHabit?.reminderMinute ?? 0);

  const isValid = name.trim().length > 0;

  const handleSave = async () => {
    if (!isValid) return;
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (editHabit) {
      updateHabit(editHabit.id, { name: name.trim(), icon, color, frequency, reminderEnabled, reminderHour, reminderMinute });
    } else {
      addHabit({ name: name.trim(), icon, color, frequency, reminderEnabled, reminderHour, reminderMinute });
    }
    onClose();
    setName("");
    setIcon(ICONS[0]!);
    setColor(COLORS[0]!);
    setFrequency("daily");
    setReminderEnabled(false);
  };

  const formatTime = (h: number, m: number) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    const min = m.toString().padStart(2, "0");
    return `${hour}:${min} ${ampm}`;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.primary }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {editHabit ? "Edit Habit" : "New Habit"}
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={!isValid}
            style={[styles.saveBtn, { backgroundColor: isValid ? color : colors.muted }]}
          >
            <Text style={[styles.saveText, { color: isValid ? "#fff" : colors.mutedForeground }]}>Save</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>NAME</Text>
            <TextInput
              style={[styles.nameInput, { color: colors.foreground }]}
              placeholder="e.g. Morning Run"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
              autoFocus={!editHabit}
              maxLength={40}
            />
          </View>

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ICON</Text>
            <View style={styles.iconGrid}>
              {ICONS.map((ic) => (
                <Pressable
                  key={ic}
                  onPress={() => setIcon(ic)}
                  style={[
                    styles.iconOption,
                    {
                      backgroundColor: icon === ic ? color + "33" : colors.secondary,
                      borderWidth: icon === ic ? 2 : 0,
                      borderColor: icon === ic ? color : "transparent",
                    },
                  ]}
                >
                  <Text style={styles.iconOptionText}>{ic}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>COLOR</Text>
            <View style={styles.colorRow}>
              {COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: c },
                    color === c && styles.colorSelected,
                  ]}
                >
                  {color === c && <Text style={styles.colorCheck}>✓</Text>}
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FREQUENCY</Text>
            {FREQ_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setFrequency(opt.value)}
                style={[
                  styles.freqRow,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: frequency === opt.value ? color + "11" : "transparent",
                  },
                ]}
              >
                <View style={styles.freqTextGroup}>
                  <Text style={[styles.freqLabel, { color: colors.foreground }]}>{opt.label}</Text>
                  <Text style={[styles.freqDesc, { color: colors.mutedForeground }]}>{opt.desc}</Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    {
                      borderColor: frequency === opt.value ? color : colors.border,
                      backgroundColor: frequency === opt.value ? color : "transparent",
                    },
                  ]}
                >
                  {frequency === opt.value && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            ))}
          </View>

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.reminderRow}>
              <View>
                <Text style={[styles.reminderTitle, { color: colors.foreground }]}>Daily Reminder</Text>
                <Text style={[styles.reminderSub, { color: colors.mutedForeground }]}>
                  {reminderEnabled ? formatTime(reminderHour, reminderMinute) : "Off"}
                </Text>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={setReminderEnabled}
                trackColor={{ false: colors.border, true: color }}
                thumbColor="#fff"
              />
            </View>
            {reminderEnabled && (
              <View style={[styles.timePicker, { borderTopColor: colors.border }]}>
                <View style={styles.timeRow}>
                  <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>Hour</Text>
                  <View style={styles.timeControls}>
                    <Pressable
                      onPress={() => setReminderHour((h) => (h - 1 + 24) % 24)}
                      style={[styles.timeBtn, { backgroundColor: colors.secondary }]}
                    >
                      <Text style={[styles.timeBtnText, { color: colors.foreground }]}>−</Text>
                    </Pressable>
                    <Text style={[styles.timeValue, { color: colors.foreground }]}>
                      {reminderHour.toString().padStart(2, "0")}
                    </Text>
                    <Pressable
                      onPress={() => setReminderHour((h) => (h + 1) % 24)}
                      style={[styles.timeBtn, { backgroundColor: colors.secondary }]}
                    >
                      <Text style={[styles.timeBtnText, { color: colors.foreground }]}>+</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.timeRow}>
                  <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>Minute</Text>
                  <View style={styles.timeControls}>
                    <Pressable
                      onPress={() => setReminderMinute((m) => (m - 5 + 60) % 60)}
                      style={[styles.timeBtn, { backgroundColor: colors.secondary }]}
                    >
                      <Text style={[styles.timeBtnText, { color: colors.foreground }]}>−</Text>
                    </Pressable>
                    <Text style={[styles.timeValue, { color: colors.foreground }]}>
                      {reminderMinute.toString().padStart(2, "0")}
                    </Text>
                    <Pressable
                      onPress={() => setReminderMinute((m) => (m + 5) % 60)}
                      style={[styles.timeBtn, { backgroundColor: colors.secondary }]}
                    >
                      <Text style={[styles.timeBtnText, { color: colors.foreground }]}>+</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </View>

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  cancelBtn: { padding: 4 },
  cancelText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  saveBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 7 },
  saveText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  nameInput: {
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  iconOptionText: { fontSize: 22 },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  colorCheck: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  freqRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  freqTextGroup: { gap: 2 },
  freqLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  freqDesc: { fontSize: 12, fontFamily: "Inter_400Regular" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reminderTitle: { fontSize: 15, fontFamily: "Inter_500Medium" },
  reminderSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  timePicker: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, gap: 12 },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timeLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  timeControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  timeBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  timeBtnText: { fontSize: 20, fontFamily: "Inter_400Regular" },
  timeValue: { fontSize: 20, fontFamily: "Inter_700Bold", minWidth: 40, textAlign: "center" },
});
