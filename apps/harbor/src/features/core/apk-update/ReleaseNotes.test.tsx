import { ThemeProvider } from '@/src/common/theme';
import { render } from '@testing-library/react-native';
import { ReleaseNotes } from './ReleaseNotes';

const NOTES = [
  '### Fixed (2 changes)',
  '',
  '- [Fix feed jumps](https://gitlab.example/mr/1) by @mark',
  '- makes **startup** faster',
  'plain trailing text',
].join('\n');

describe('ReleaseNotes', () => {
  it('renders the changelog subset without markdown syntax', async () => {
    const { getByText, queryByText } = await render(
      <ThemeProvider>
        <ReleaseNotes notes={NOTES} />
      </ThemeProvider>,
    );

    getByText('Fixed (2 changes)');
    getByText(/Fix feed jumps/);
    getByText('startup');
    getByText('plain trailing text');

    expect(queryByText(/###/)).toBeNull();
    expect(queryByText(/https:/)).toBeNull();
    expect(queryByText(/\*\*/)).toBeNull();
  });
});
