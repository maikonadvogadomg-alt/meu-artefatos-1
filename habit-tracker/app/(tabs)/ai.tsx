import React from "react";
import { View, Text, StyleSheet } from "react-native";

// This screen is hidden (href: null in layout).
// The AI chat is accessible via the floating Iara button.
export default function AIScreenHidden() {
  return <View style={s.root}><Text style={s.t}>IA</Text></View>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: "#080c18" }, t: { color: "#fff" } });
