import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Frequency = "daily" | "3x_week" | "5x_week" | "weekdays";

export interface Habit {
  id: string;
  name: string;
  icon: string;
  color: string;
  frequency: Frequency;
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  createdAt: string;
  completions: string[];
}

interface HabitContextValue {
  habits: Habit[];
  addHabit: (habit: Omit<Habit, "id" | "createdAt" | "completions">) => void;
  updateHabit: (id: string, updates: Partial<Omit<Habit, "id" | "createdAt" | "completions">>) => void;
  deleteHabit: (id: string) => void;
  toggleCompletion: (habitId: string, date: string) => void;
  isCompleted: (habitId: string, date: string) => boolean;
  getStreak: (habitId: string) => number;
  getLongestStreak: (habitId: string) => number;
  getWeeklyStats: () => { week: string; completed: number; total: number }[];
  getCompletionRate: (habitId: string, days?: number) => number;
}

const HabitContext = createContext<HabitContextValue | null>(null);

const STORAGE_KEY = "habit_tracker_habits_v2";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

function getDatesForFrequency(habit: Habit, daysBack: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (habit.frequency === "daily") {
      dates.push(toDateString(d));
    } else if (habit.frequency === "weekdays") {
      if (dow >= 1 && dow <= 5) dates.push(toDateString(d));
    } else if (habit.frequency === "3x_week") {
      if (dow === 1 || dow === 3 || dow === 5) dates.push(toDateString(d));
    } else if (habit.frequency === "5x_week") {
      if (dow >= 1 && dow <= 5) dates.push(toDateString(d));
    }
  }
  return dates;
}

export function HabitProvider({ children }: { children: React.ReactNode }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val) {
        try {
          setHabits(JSON.parse(val));
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
    }
  }, [habits, loaded]);

  const addHabit = useCallback(
    (data: Omit<Habit, "id" | "createdAt" | "completions">) => {
      const habit: Habit = {
        ...data,
        id: generateId(),
        createdAt: toDateString(new Date()),
        completions: [],
      };
      setHabits((prev) => [...prev, habit]);
    },
    []
  );

  const updateHabit = useCallback(
    (id: string, updates: Partial<Omit<Habit, "id" | "createdAt" | "completions">>) => {
      setHabits((prev) =>
        prev.map((h) => (h.id === id ? { ...h, ...updates } : h))
      );
    },
    []
  );

  const deleteHabit = useCallback((id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const toggleCompletion = useCallback((habitId: string, date: string) => {
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId) return h;
        const exists = h.completions.includes(date);
        return {
          ...h,
          completions: exists
            ? h.completions.filter((d) => d !== date)
            : [...h.completions, date],
        };
      })
    );
  }, []);

  const isCompleted = useCallback(
    (habitId: string, date: string) => {
      const habit = habits.find((h) => h.id === habitId);
      return habit?.completions.includes(date) ?? false;
    },
    [habits]
  );

  const getStreak = useCallback(
    (habitId: string) => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return 0;
      const today = toDateString(new Date());
      let streak = 0;
      const check = new Date();
      while (true) {
        const dateStr = toDateString(check);
        if (dateStr > today) {
          check.setDate(check.getDate() - 1);
          continue;
        }
        const dow = check.getDay();
        let isExpected = false;
        if (habit.frequency === "daily") isExpected = true;
        else if (habit.frequency === "weekdays") isExpected = dow >= 1 && dow <= 5;
        else if (habit.frequency === "3x_week") isExpected = dow === 1 || dow === 3 || dow === 5;
        else if (habit.frequency === "5x_week") isExpected = dow >= 1 && dow <= 5;
        if (isExpected) {
          if (habit.completions.includes(dateStr)) {
            streak++;
          } else {
            if (dateStr === today) {
              check.setDate(check.getDate() - 1);
              continue;
            }
            break;
          }
        }
        if (streak > 365) break;
        check.setDate(check.getDate() - 1);
      }
      return streak;
    },
    [habits]
  );

  const getLongestStreak = useCallback(
    (habitId: string) => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit || habit.completions.length === 0) return 0;
      const sorted = [...habit.completions].sort();
      let longest = 0;
      let current = 1;
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1]!);
        const curr = new Date(sorted[i]!);
        const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          current++;
          longest = Math.max(longest, current);
        } else {
          current = 1;
        }
      }
      return Math.max(longest, current);
    },
    [habits]
  );

  const getWeeklyStats = useCallback(() => {
    const result: { week: string; completed: number; total: number }[] = [];
    for (let w = 3; w >= 0; w--) {
      const start = new Date();
      start.setDate(start.getDate() - start.getDay() - w * 7);
      let completed = 0;
      let total = 0;
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(day.getDate() + d);
        if (day > new Date()) continue;
        const dateStr = toDateString(day);
        const dow = day.getDay();
        for (const h of habits) {
          let expected = false;
          if (h.frequency === "daily") expected = true;
          else if (h.frequency === "weekdays") expected = dow >= 1 && dow <= 5;
          else if (h.frequency === "3x_week") expected = dow === 1 || dow === 3 || dow === 5;
          else if (h.frequency === "5x_week") expected = dow >= 1 && dow <= 5;
          if (expected) {
            total++;
            if (h.completions.includes(dateStr)) completed++;
          }
        }
      }
      const label = w === 0 ? "This week" : w === 1 ? "Last week" : `${w * 7}d ago`;
      result.push({ week: label, completed, total });
    }
    return result;
  }, [habits]);

  const getCompletionRate = useCallback(
    (habitId: string, days = 30) => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return 0;
      const expectedDates = getDatesForFrequency(habit, days);
      if (expectedDates.length === 0) return 0;
      const done = expectedDates.filter((d) => habit.completions.includes(d)).length;
      return Math.round((done / expectedDates.length) * 100);
    },
    [habits]
  );

  return (
    <HabitContext.Provider
      value={{
        habits,
        addHabit,
        updateHabit,
        deleteHabit,
        toggleCompletion,
        isCompleted,
        getStreak,
        getLongestStreak,
        getWeeklyStats,
        getCompletionRate,
      }}
    >
      {children}
    </HabitContext.Provider>
  );
}

export function useHabits() {
  const ctx = useContext(HabitContext);
  if (!ctx) throw new Error("useHabits must be used inside HabitProvider");
  return ctx;
}
