import { Sheet } from '@/src/common/components/sheet';

type ShareSheetProps = {
  identityKey: string;
  open: boolean;
  onClose: () => void;
};

export default function ShareSheet({ open, onClose }: ShareSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={[0.5, 1]}
      header={<Sheet.Header title="Share" onClose={onClose} />}
    >
      <Sheet.Content />
    </Sheet>
  );
}
