import { View, StyleSheet } from "react-native";
import { Text } from "@/components/primitives";
import { BackButton } from "./BackButton";
import { CloseButton } from "./CloseButton";
import { useTheme } from "@/theme";

interface PageHeaderProps {
  title?: string;
  onBack?: () => void;
  onClose?: () => void;
}

// TODO: use swiftUI of buttons
export function PageHeader({ title, onBack, onClose }: PageHeaderProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { marginTop: theme.spacing.xl, marginBottom: theme.spacing.xl },
      ]}
    >
      <View style={[styles.left, { marginTop: theme.spacing.xs }]}>
        {onBack && <BackButton onPress={onBack} />}
      </View>
      <View style={styles.center}>
        {title && (
          <Text variant="subtitle" numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>
      <View style={[styles.right, { marginTop: theme.spacing.xs }]}>
        {onClose && <CloseButton onPress={onClose} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  left: {
    flex: 1,
    alignItems: "flex-start",
  },
  center: {
    flex: 2,
    alignItems: "center",
  },
  right: {
    flex: 1,
    alignItems: "flex-end",
  },
});
