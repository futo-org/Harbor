import Icon from './Icon';
import { Tooltip } from './Tooltip';

/** A small information icon that reveals an explanatory bubble. */
export function InfoTooltip({
  text,
  size = 15,
}: {
  text: string;
  size?: number;
}) {
  return (
    <Tooltip text={text} accessibilityLabel="More information" inline>
      <Icon name="infoOutline" size={size} color="neutral_500" />
    </Tooltip>
  );
}
