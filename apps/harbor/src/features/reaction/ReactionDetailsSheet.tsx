import { Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Sheet } from '@/src/common/components/sheet';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { View } from 'react-native';
import type { DisplayReaction } from './util';

type ReactionDetailsSheetProps = {
  displayReactions: DisplayReaction[];
  open: boolean;
  onClose: () => void;
};

/**
 * Sheet that displays the reaction tallies received from the server for a post.
 */
export default function ReactionDetailsSheet({
  displayReactions,
  open,
  onClose,
}: ReactionDetailsSheetProps) {
  const { theme } = useTheme();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={[0.5, 0.9]}
      header={<Sheet.Header title="Reactions" onClose={onClose} />}
    >
      <Sheet.Content>
        <View style={[Atoms.flex_row, Atoms.gap_sm, { flexWrap: 'wrap' }]}>
          {displayReactions.map((reaction) => (
            <View
              key={reaction.emoji}
              style={[
                Atoms.flex_row,
                Atoms.align_center,
                Atoms.gap_sm,
                Atoms.px_md,
                Atoms.py_sm,
                Atoms.rounded_md,
                {
                  backgroundColor: reaction.mine
                    ? withHexOpacity(theme.palette.primary_50, '30')
                    : theme.palette.neutral_50,
                },
              ]}
            >
              {reaction.mine ? (
                <Icon name="personOutline" color="neutral_700" />
              ) : null}
              <Text style={{ fontSize: 18 }}>{reaction.emoji}</Text>
              <Text fontWeight="bold">{reaction.count}</Text>
            </View>
          ))}
        </View>
      </Sheet.Content>
    </Sheet>
  );
}
