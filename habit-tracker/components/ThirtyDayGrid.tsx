import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Habit } from "@/context/HabitContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  habit: Habit;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function ThirtyDayGrid({ habit }: Props) {
  const colors = useColors();

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0]!;

  const cells: {
    date: string;
    dow: number;
    done: boolean;
    isFuture: boolean;
    isExpected: boolean;
    label: string;
  }[] = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0]!;
    const dow = d.getDay();
    let isExpected = false;
    if (habit.frequency === "daily") isExpected = true;
    else if (habit.frequency === "weekdays") isExpected = dow >= 1 && dow <= 5;
    else if (habit.frequency === "3x_week") isExpected = dow === 1 || dow === 3 || dow === 5;
    else if (habit.frequency === "5x_week") isExpected = dow >= 1 && dow <= 5;

    cells.push({
      date: dateStr,
      dow,
      done: habit.completions.includes(dateStr),
      isFuture: dateStr > todayStr,
      isExpected,
      label: d.getDate().toString(),
    });
  }

  const completedCount = cells.filter((c) => c.done).length;
  const expectedCount = cells.filter((c) => c.isExpected && !c.isFuture).length;
  const rate = expectedCount > 0 ? Math.round((completedCount / expectedCount) * 100) : 0;

  return (
    <View>
      <View style={styles.statsRow}>
        <View style={[styles.statBox, { backgroundColor: colors.card }]}>
          <Text style={[styles.statNum, { color: habit.color }]}>{completedCount}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Done</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.card }]}>
          <Text style={[styles.statNum, { color: colors.foreground }]}>{expectedCount}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Expected</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.card }]}>
          <Text style={[styles.statNum, { color: rate >= 80 ? colors.success : rate >= 50 ? colors.warning : colors.destructive }]}>
            {rate}%
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Rate</Text>
        </View>
      </View>

      <View style={styles.gridWrapper}>
        <View style={styles.dayLabels}>
          {DAY_LABELS.map((l, i) => (
            <Text key={i} style={[styles.dayLabel, { color: colors.mutedForeground }]}>
              {l}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((cell, idx) => {
            let bg = colors.gridFuture;
            if (!cell.isFuture) {
              if (cell.done) {
                bg = habit.color;
              } else if (cell.isExpected) {
                bg = colors.gridEmpty;
              } else {
                bg = colors.gridFuture;
              }
            }

            const isToday = cell.date === todayStr;

            return (
              <View
                key={cell.date}
                style={[
                  styles.cell,
                  {
                    backgroundColor: bg,
                    borderWidth: isToday ? 2 : 0,
                    borderColor: isToday ? habit.color : "transparent",
                    opacity: cell.isFuture ? 0.3 : 1,
                  },
                ]}
              >
                {(idx % 7 === 0 || cell.date === cells[0]?.date) && (
                  <Text style={[styles.cellLabel, { color: cell.done ? "#fff" : colors.mutedForeground, opacity: 0.7 }]}>
                    {cell.label}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: habit.color }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Done</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.gridEmpty }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Missed</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.gridFuture, opacity: 0.5 }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Not scheduled</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    gap: 2,
  },
  statNum: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  gridWrapper: {
    marginBottom: 16,
  },
  dayLabels: {
    flexDirection: "row",
    marginBottom: 4,
  },
  dayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  cell: {
    width: "12.5%",
    aspectRatio: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: "1.5%",
    marginBottom: 4,
  },
  cellLabel: {
    fontSize: 8,
    fontFamily: "Inter_500Medium",
  },
  legend: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
