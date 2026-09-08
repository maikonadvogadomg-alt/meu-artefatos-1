import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Platform, StyleSheet, View } from "react-native";
import React from "react";

export default function TabLayout() {
  const isIOS = Platform.OS === "ios";

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#818cf8",
          tabBarInactiveTintColor: "#64748b",
          tabBarStyle: {
            position: "absolute",
            backgroundColor: isIOS ? "transparent" : "#0f1629",
            borderTopWidth: 1,
            borderTopColor: "#1e293b",
            elevation: 0,
            height: Platform.OS === "web" ? 64 : 84,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontFamily: "Inter_500Medium",
            marginBottom: Platform.OS === "web" ? 4 : 6,
          },
          tabBarBackground: () =>
            isIOS ? (
              <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0f1629" }]} />
            ),
        }}
      >
        {/* Chat principal (campo livre IA) */}
        <Tabs.Screen
          name="index"
          options={{
            title: "Chat",
            tabBarIcon: ({ color }) => <Feather name="message-circle" size={22} color={color} />,
          }}
        />

        {/* Playground */}
        <Tabs.Screen
          name="playground"
          options={{
            title: "Playground",
            tabBarIcon: ({ color }) => <Feather name="zap" size={22} color={color} />,
            tabBarActiveTintColor: "#f59e0b",
          }}
        />

        {/* GitHub */}
        <Tabs.Screen
          name="github"
          options={{
            title: "GitHub",
            tabBarIcon: ({ color }) => <Feather name="github" size={22} color={color} />,
            tabBarActiveTintColor: "#e2e8f0",
          }}
        />

        {/* APK Export */}
        <Tabs.Screen
          name="export"
          options={{
            title: "APK",
            tabBarIcon: ({ color }) => <Feather name="smartphone" size={22} color={color} />,
            tabBarActiveTintColor: "#818cf8",
          }}
        />

        {/* Configuração */}
        <Tabs.Screen
          name="keys"
          options={{
            title: "Configuração",
            tabBarIcon: ({ color }) => <Feather name="settings" size={22} color={color} />,
          }}
        />

        {/* Hidden tabs */}
        <Tabs.Screen name="juridico" options={{ href: null }} />
        <Tabs.Screen name="sk-editor" options={{ href: null }} />
        <Tabs.Screen name="editor" options={{ href: null }} />
        <Tabs.Screen name="ai" options={{ href: null }} />
        <Tabs.Screen name="guide" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({});
