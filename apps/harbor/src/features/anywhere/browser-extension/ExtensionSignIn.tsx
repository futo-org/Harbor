import { isWeb } from '@/src/common/util/platform';
import { SignupBar } from '@/src/features/core/identity/SignupWidget';
import { ExtensionLoginCode } from './ExtensionLoginCode';
import { useExtensionLogin } from './hooks/useExtensionLogin';
import { OPEN_SITE_MESSAGE } from '../lib/login-messages';

/**
 * The signed-out extension's bottom bar: the code to match once a Harbor
 * tab offers to sign it in, otherwise where to sign up or log in.
 */
export function ExtensionSignIn({ tabUrl }: { tabUrl: string | undefined }) {
  const login = useExtensionLogin(tabUrl);

  if (login.session) {
    return (
      <ExtensionLoginCode session={login.session} onCancel={login.cancel} />
    );
  }

  return (
    // Identities live on the Harbor site; the extension signs in from it.
    <SignupBar
      onNavigate={
        isWeb && window.parent !== window
          ? (path) =>
              window.parent.postMessage({ type: OPEN_SITE_MESSAGE, path }, '*')
          : undefined
      }
    />
  );
}
