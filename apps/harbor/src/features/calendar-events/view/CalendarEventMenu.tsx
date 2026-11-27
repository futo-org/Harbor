import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon from '@/src/common/components/Icon';
import { toast } from '@/src/common/components/toast/useToast';
import { Routes } from '@/src/common/constants';
import { useCopyToClipboard } from '@/src/common/lib/useCopyToClipboard';
import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { Alert } from '@/src/common/util/Alert';
import ReportSheet from '@/src/features/moderation/ReportSheet';
import { ClaimLinkShareSheet } from '@/src/features/verifications/claims/link/ClaimLinkShareSheet';
import { attendanceClaimLink } from '@/src/features/verifications/claims/link/lib/claim-link';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { deleteCalendarEvent } from '../lib/calendar-actions';
import {
  type CalendarEventData,
  calendarEventLink,
} from '../lib/calendar-event';

type CalendarEventMenuProps = { event: CalendarEventData };

/** Links for everyone. Delete for the creator, report for everyone else */
export function CalendarEventMenu({ event }: CalendarEventMenuProps) {
  const { theme } = useTheme();
  const client = usePolycentric();
  const { identityKey } = useCurrentIdentity();
  const isHost = identityKey === event.identity;
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [showAttendanceQr, setShowAttendanceQr] = useState(false);
  const { copyToClipboard } = useCopyToClipboard({ showToast: true });

  const onDeletePress = () => {
    Alert.alert('Delete this event?', "This can't be undone.", [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCalendarEvent(client, event.id);
            toast.success('Event deleted');
            if (router.canGoBack()) router.back();
            else router.navigate(Routes.tabs.calendarEvents);
          } catch (err) {
            console.error(err);
            toast.error("Couldn't delete the event. Try again.");
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger
          hitSlop={16}
          style={Atoms.outline_none}
          accessibilityLabel="Event options"
          testID="calendar-event-menu"
        >
          {({ pressed, hovered }) => (
            <View
              style={[
                Atoms.p_xs,
                Atoms.rounded_full,
                Atoms.overflow_hidden,
                (hovered || pressed) && theme.atoms.box.raised.bg,
              ]}
            >
              <Icon name="dotsVertical" color="muted" size={20} />
            </View>
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item
            onPress={() => copyToClipboard(calendarEventLink(event))}
            testID="calendar-event-copy-link"
          >
            <Icon name="copy" color="muted" size={16} />
            <Text variant="secondary" fontWeight="bold">
              Copy link
            </Text>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onPress={() => setShowAttendanceQr(true)}
            testID="calendar-event-attendance-qr"
          >
            <Icon name="qrCode" color="muted" size={16} />
            <Text variant="secondary" fontWeight="bold">
              Attendance QR code
            </Text>
          </DropdownMenu.Item>
          {isHost ? (
            <DropdownMenu.Item
              onPress={onDeletePress}
              testID="calendar-event-delete"
            >
              <Icon name="trashBin" color="danger" size={16} />
              <Text variant="secondary" fontWeight="bold" color="danger">
                Delete
              </Text>
            </DropdownMenu.Item>
          ) : (
            <DropdownMenu.Item
              onPress={() => setShowReportSheet(true)}
              testID="calendar-event-report"
            >
              <Icon name="flag" color="muted" size={16} />
              <Text variant="secondary" fontWeight="bold">
                Report
              </Text>
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu>

      <ClaimLinkShareSheet
        open={showAttendanceQr}
        onClose={() => setShowAttendanceQr(false)}
        link={attendanceClaimLink(event)}
        title="Attendance QR code"
        caption={event.title}
        hint="Scanning this opens a claim that they attended, ready to send."
      />

      <ReportSheet
        eventId={event.id}
        open={showReportSheet}
        onClose={() => setShowReportSheet(false)}
      />
    </>
  );
}
