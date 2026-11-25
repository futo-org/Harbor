import { ADDON_ID, PARAM_KEY } from '@storybook/addon-ondevice-controls';
import ControlsPanel from '@storybook/addon-ondevice-controls/dist/ControlsPanel';
import { AddonPanel } from '@storybook/addon-ondevice-controls/dist/Panel';
import { addons, types } from 'storybook/manager-api';

// The addon's own registration, except the panel remounts per story. Otherwise
// its first render after a story switch pairs the new story's controls with the
// previous story's args, and e.g. a string `size` crashes a range slider on web.
// Drop once storybookjs/react-native#960 is released.
addons.register(ADDON_ID, (api) => {
  addons.add(ADDON_ID, {
    type: types.PANEL,
    title: 'Controls',
    render: ({ active }) => (
      <AddonPanel active={active}>
        <ControlsPanel key={api.store().getSelection()?.storyId} api={api} />
      </AddonPanel>
    ),
    paramKey: PARAM_KEY,
  });
});
