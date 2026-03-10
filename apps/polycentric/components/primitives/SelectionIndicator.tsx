import { View, StyleSheet } from "react-native";
import { useTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";

const SIZE = 20;

export function SelectionIndicator() {
  const { isDark, theme } = useTheme();

  return (
    <View style={[styles.indicator, { backgroundColor: theme.colors.primary }]}>
      <Ionicons
        name="checkmark-sharp"
        size={16}
        color={isDark ? theme.colors.black : theme.colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  indicator: {
    width: SIZE,
    height: SIZE,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
});
