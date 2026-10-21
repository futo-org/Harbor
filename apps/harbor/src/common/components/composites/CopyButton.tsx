import { Button } from '@/src/common/components/primitives';
import { useCopyToClipboard } from '@/src/common/lib/useCopyToClipboard';

type CopyButtonProps = {
  title: string;
  // null also disables the button
  value: string | null;
};

export function CopyButton({ title, value }: CopyButtonProps) {
  const { copyToClipboard, justCopied } = useCopyToClipboard();

  return (
    <Button
      title={justCopied ? 'Copied' : title}
      icon={justCopied ? 'checkmark' : 'copy'}
      variant="primary"
      size="md"
      fullWidth
      disabled={value === null}
      onPress={() => {
        if (value !== null) copyToClipboard(value);
      }}
    />
  );
}
