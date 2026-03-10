import { ScrollView, StyleSheet } from "react-native";
import { useTheme } from "@/theme";

interface HorizontalScrollGroupProps {
  children: React.ReactNode;
}

export function HorizontalScrollGroup({
  children,
}: HorizontalScrollGroupProps) {
  const { theme } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.container, { gap: theme.spacing.sm }]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
});
