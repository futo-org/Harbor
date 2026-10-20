import { Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Sheet } from '@/src/common/components/sheet';
import { toast } from '@/src/common/components/toast';
import {
  bytesToHex,
  publicKeyToString,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useCopyToClipboard } from '@/src/common/lib/useCopyToClipboard';
import {
  Atoms,
  type PaletteColorToken,
  type Theme,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useIdentityState } from '@/src/features/profile/hooks/useIdentityState';
import { ed25519 } from '@noble/curves/ed25519.js';
import { COLLECTION, v2 } from '@polycentric/react-native';
import { type ComponentProps, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  type TextStyle,
  View,
} from 'react-native';
import {
  decodeEvent,
  type EventLookup,
  type EventSource,
  lookupKey,
  lookupQuery,
  type SignedEventResult,
  tryOrNull,
  useSignedEvent,
} from './useSignedEvent';

const MONO: TextStyle = { fontFamily: 'monospace' };
const PRESSED: TextStyle = { opacity: 0.65 };

const INFO_TITLES: Record<number, string> = {
  [COLLECTION.IDENTITY]: 'Identity info',
  [COLLECTION.PROFILE]: 'Profile info',
  [COLLECTION.FEED]: 'Post info',
};

const COLLECTION_NAMES: Record<number, string> = {
  [COLLECTION.IDENTITY]: 'Identity',
  [COLLECTION.FEED]: 'Feed',
  [COLLECTION.PROFILE]: 'Profile',
  [COLLECTION.INTERACTIONS]: 'Interactions',
  [COLLECTION.GRAPH]: 'Social graph',
  [COLLECTION.REPORTS]: 'Reports',
  [COLLECTION.LABELS]: 'Labels',
  [COLLECTION.VERIFICATIONS]: 'Verifications',
};

type EventInfoSheetProps = {
  source: EventSource | null;
  open: boolean;
  onClose: () => void;
};

/** Signature, fields, identity document and vector clock of an event. */
export default function EventInfoSheet({
  source,
  open,
  onClose,
}: EventInfoSheetProps) {
  // Events opened from links, newest last.
  const [stack, setStack] = useState<EventSource[]>([]);
  useEffect(() => {
    if (!open) setStack([]);
  }, [open]);

  const current = stack[stack.length - 1] ?? source;
  const push = (next: EventSource) => setStack((s) => [...s, next]);
  const back = () => setStack((s) => s.slice(0, -1));

  return (
    <Sheet open={open} onClose={onClose} detents={[0.75, 1]} dismissible>
      <Sheet.Header
        title={current ? sourceTitle(current) : 'Event info'}
        closeIcon={stack.length > 0 ? 'chevronBack' : undefined}
        onClose={stack.length > 0 ? back : onClose}
      />
      <Sheet.Content style={Atoms.gap_lg}>
        {current ? <EventDetails source={current} onOpen={push} /> : null}
      </Sheet.Content>
    </Sheet>
  );
}

function sourceTitle(source: EventSource): string {
  const collection =
    'signedEvent' in source
      ? decodeEvent(source.signedEvent)?.key?.collection
      : source.collection;
  return (collection != null && INFO_TITLES[collection]) || 'Event info';
}

function EventDetails({
  source,
  onOpen,
}: {
  source: EventSource;
  onOpen: (next: EventSource) => void;
}) {
  const { signedEvent, bundle, isLoading } = useSignedEvent(source);

  if (isLoading) return <ActivityIndicator style={Atoms.self_center} />;
  if (!signedEvent || !decodeEvent(signedEvent)) {
    return (
      <Text variant="secondary" color="neutral_500">
        Event not found
      </Text>
    );
  }
  return (
    <LoadedEvent signedEvent={signedEvent} bundle={bundle} onOpen={onOpen} />
  );
}

function LoadedEvent({
  signedEvent,
  bundle,
  onOpen,
}: {
  signedEvent: v2.SignedEvent;
  /** Set when fetched; carries the content. */
  bundle: v2.EventBundle | null;
  onOpen: (next: EventSource) => void;
}) {
  // Not a prop: React's dev render logger can't JSON-serialise the BigInt clock.
  const event = useMemo(
    () => decodeEvent(signedEvent) as v2.Event,
    [signedEvent],
  );
  const key = event.key as v2.EventKey;
  const signer = key.signedBy;
  const isIdentityEvent = key.collection === COLLECTION.IDENTITY;

  const self: EventLookup = {
    identity: key.identity,
    collection: key.collection,
    signedBy: signer,
    sequence: key.sequence,
  };
  const bySigner = (offset: bigint): EventLookup | null =>
    signer ? { ...self, sequence: key.sequence + offset } : null;
  const identityDoc = (sequence?: bigint): EventLookup => ({
    identity: key.identity,
    collection: COLLECTION.IDENTITY,
    sequence,
  });

  // Posts arrive without content; fetch it for the raw view.
  const ownBundle = useSignedEvent(bundle ? null : self);
  const content = bundle ?? ownBundle.bundle;
  const rawEvent = useMemo(
    () => JSON.stringify(v2.Event.toJson(event), null, 2),
    [event],
  );
  const rawContent = useMemo(() => {
    const bytes = content?.serializedContent?.contentBytes;
    if (!bytes) return null;
    return tryOrNull(() =>
      JSON.stringify(v2.Content.toJson(v2.Content.fromBinary(bytes)), null, 2),
    );
  }, [content]);

  const valid = useMemo(
    () => verifySignature(signedEvent, signer),
    [signedEvent, signer],
  );

  const document = useSignedEvent(
    event.identitySequence > 0n ? identityDoc(event.identitySequence) : null,
  );
  const identity = useMemo(
    () => decodeIdentity(document.bundle),
    [document.bundle],
  );
  const keys = useMemo(
    () => (identity ? documentKeys(identity) : []),
    [identity],
  );
  const signerIndex = signer
    ? keys.findIndex((k) => sameKey(k.key, signer))
    : -1;

  const previousLookup = key.sequence > 1n ? bySigner(-1n) : null;
  const nextLookup = bySigner(1n);
  const previous = useSignedEvent(previousLookup);
  const next = useSignedEvent(nextLookup);
  const previousEvent = useMemo(
    () => decodeEvent(previous.signedEvent),
    [previous.signedEvent],
  );
  const previousSignatureLookup = usePreviousSignatureLookup(
    event,
    keys,
    previousLookup,
    previous.signedEvent,
  );

  const clock = event.vectorClock?.sequence ?? [];
  const clockWarning = previousEvent
    ? compareClocks(previousEvent, event)
    : null;
  const isLatest = !next.signedEvent && !next.isLoading;
  const open = (lookup: EventLookup | null) =>
    lookup ? () => onOpen(lookup) : undefined;

  return (
    <>
      <EventNav
        sequence={key.sequence}
        previous={previous}
        next={next}
        onPrevious={open(previousLookup)}
        onNext={open(nextLookup)}
      />

      <Section title="Signature">
        <Row label="Signature" value={hexOrNone(signedEvent.signature)}>
          <StatusChip
            label={valid ? 'Valid' : 'Invalid'}
            tone={valid ? 'positive_500' : 'negative_500'}
          />
        </Row>
        <Row
          label={`Signing key (${keyTypeName(signer?.keyType)})`}
          value={signer ? publicKeyToString(signer) : 'None'}
          note={
            identity && signerIndex < 0
              ? 'Not in the identity document'
              : undefined
          }
        />
      </Section>

      <Section title="Event">
        <Row
          label="Collection / sequence"
          value={`${collectionName(key.collection)} / ${key.sequence}`}
        />
        <Row
          label="Created"
          value={new Date(Number(event.createdAt)).toISOString()}
        />
        <Row
          label={`Content digest (${digestTypeName(event.contentDigest?.type)})`}
          value={hexOrNone(event.contentDigest?.value)}
        />
        <Row
          label="Application"
          value={
            event.application
              ? `${event.application.name} ${event.application.version} (${event.application.id})`
              : 'Unknown'
          }
        />
        <Row
          label="Previous signature"
          value={hexOrNone(event.previousSignature)}
          onPress={open(previousSignatureLookup)}
        />
        <Row label="Previous root" value={hexOrNone(event.previousRoot)} />
        <RawBlock label="raw event" json={rawEvent} />
        <RawBlock
          label="raw content"
          json={rawContent}
          loading={!bundle && ownBundle.isLoading}
        />
      </Section>

      <Section title="Identity document">
        <Row
          label="Identity"
          value={key.identity}
          // Latest identity document, unless this is it.
          onPress={open(isIdentityEvent && isLatest ? null : identityDoc())}
        />
        <Row
          label="Document sequence"
          value={String(event.identitySequence)}
          note={
            identity
              ? `${identity.rotationKeys.length} rotation, ${identity.signingKeys.length} signing keys`
              : document.isLoading
                ? 'Loading…'
                : 'Not found'
          }
          // Identity events reference themselves.
          onPress={open(
            event.identitySequence > 0n &&
              !(isIdentityEvent && key.sequence === event.identitySequence)
              ? identityDoc(event.identitySequence)
              : null,
          )}
        />
      </Section>

      <Section title="Vector clock">
        <VectorClock
          entries={clock.map((value, index) => ({
            value: String(value),
            link: index < keys.length && value > 0n,
            isSigner: index === signerIndex,
          }))}
          onOpen={(index) =>
            onOpen({
              ...self,
              signedBy: keys[index].key,
              sequence: clock[index],
            })
          }
        />
        {clockWarning ? (
          <Text variant="small" color="negative_500">
            {clockWarning}
          </Text>
        ) : null}
      </Section>

      <Section title="Servers">
        <ServerConfirmations lookup={self} />
      </Section>
    </>
  );
}

// --- Servers ---

type Confirmation = 'checking' | 'confirmed' | 'missing' | 'unreachable';

const CONFIRMATION_CHIPS: Record<
  Exclude<Confirmation, 'checking'>,
  { label: string; tone: StatusTone }
> = {
  confirmed: { label: 'Confirmed', tone: 'positive_500' },
  missing: { label: 'Not found', tone: 'neutral_500' },
  unreachable: { label: 'Unreachable', tone: 'negative_500' },
};

/** Asks the author's servers and ours for this event. */
function ServerConfirmations({ lookup }: { lookup: EventLookup }) {
  const client = usePolycentric();
  const { state } = useIdentityState(lookup.identity);
  const servers = useMemo(
    () => Array.from(new Set([...(state?.servers ?? []), ...client.servers])),
    [state?.servers, client.servers],
  );
  const [results, setResults] = useState<Record<string, Confirmation>>({});

  const keyId = lookupKey(lookup);
  const serverList = servers.join(' ');

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on keyId and serverList
  useEffect(() => {
    let cancelled = false;
    setResults({});
    for (const server of servers) {
      void client
        .listEvents({
          ...lookupQuery(lookup),
          // Per-server key, or the page cache answers for all of them.
          queryKey: ['event-info', 'confirm', server, keyId],
          queryOpts: { servers: [server] },
        })
        .then((bundles) => (bundles.length > 0 ? 'confirmed' : 'missing'))
        .catch((): Confirmation => 'unreachable')
        .then((status) => {
          if (!cancelled) setResults((r) => ({ ...r, [server]: status }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [client, keyId, serverList]);

  if (servers.length === 0) {
    return (
      <Text variant="secondary" color="neutral_500">
        No servers known for this identity
      </Text>
    );
  }

  return (
    <View style={Atoms.gap_sm}>
      {servers.map((server) => {
        const status = results[server] ?? 'checking';
        return (
          <View
            key={server}
            style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}
          >
            <Text
              variant="secondary"
              style={[Atoms.flex_1, MONO]}
              numberOfLines={1}
            >
              {server.replace(/^https?:\/\//, '')}
            </Text>
            {status === 'checking' ? (
              <ActivityIndicator size="small" />
            ) : (
              <StatusChip {...CONFIRMATION_CHIPS[status]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

// --- Vector clock ---

type DocumentKey = { key: v2.PublicKey; role: 'Rotation' | 'Signing' };

/** Keys in clock order: rotation then signing, deduplicated. */
function documentKeys(identity: v2.Identity): DocumentKey[] {
  const seen = new Set<string>();
  const out: DocumentKey[] = [];
  const add = (key: v2.PublicKey, role: DocumentKey['role']) => {
    const id = `${key.keyType}:${bytesToHex(key.key)}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ key, role });
  };
  for (const key of identity.rotationKeys) add(key, 'Rotation');
  for (const key of identity.signingKeys) add(key, 'Signing');
  return out;
}

type ClockEntry = {
  /** String, not BigInt, so it survives React's dev prop logger. */
  value: string;
  link: boolean;
  isSigner: boolean;
};

/** The clock as an array; each entry links to the event it refers to. */
function VectorClock({
  entries,
  onOpen,
}: {
  entries: ClockEntry[];
  onOpen: (index: number) => void;
}) {
  const { theme } = useTheme();
  return (
    <Text variant="secondary" style={MONO} selectable>
      [
      {entries.map((entry, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: clock entries are ordinal positions
        <Text key={index} variant="secondary">
          {index > 0 ? ', ' : ''}
          <Text
            variant="secondary"
            fontWeight={entry.isSigner ? 'bold' : undefined}
            style={[MONO, entry.link && linkStyle(theme)]}
            onPress={entry.link ? () => onOpen(index) : undefined}
            accessibilityRole={entry.link ? 'link' : undefined}
            accessibilityLabel={
              entry.link
                ? `Open event ${entry.value} by key ${index + 1}`
                : undefined
            }
          >
            {entry.value}
          </Text>
        </Text>
      ))}
      ]
    </Text>
  );
}

/** Warning when the clock didn't move forward; see VectorClock::happens_before. */
function compareClocks(previous: v2.Event, current: v2.Event): string | null {
  const a = previous.vectorClock?.sequence ?? [];
  const b = current.vectorClock?.sequence ?? [];
  if (a.length !== b.length) {
    return 'The identity document changed since the previous event, so the clocks have different lengths';
  }
  if (a.some((x, i) => x > b[i])) {
    return 'Some entries went backwards since the previous event';
  }
  return null;
}

/**
 * Finds the event previous_signature points at: usually the signer's previous
 * event, otherwise one of the other keys' latest events per the clock.
 */
function usePreviousSignatureLookup(
  event: v2.Event,
  keys: DocumentKey[],
  previousLookup: EventLookup | null,
  previousSigned: v2.SignedEvent | null,
): EventLookup | null {
  const client = usePolycentric();
  const key = event.key as v2.EventKey;
  const target = bytesToHex(event.previousSignature);
  const [resolved, setResolved] = useState<{
    target: string;
    lookup: EventLookup | null;
  } | null>(null);

  const bySigner =
    !!previousSigned && bytesToHex(previousSigned.signature) === target;
  const clock = event.vectorClock?.sequence ?? [];
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the event
  useEffect(() => {
    if (!target || bySigner || keys.length === 0) return;
    let cancelled = false;
    const candidates: EventLookup[] = keys
      .map((k, i) => ({
        identity: key.identity,
        collection: key.collection,
        signedBy: k.key,
        sequence: clock[i] ?? 0n,
      }))
      .filter(
        (c) =>
          (c.sequence ?? 0n) > 0n &&
          !(key.signedBy && c.signedBy && sameKey(c.signedBy, key.signedBy)),
      );
    void Promise.all(
      candidates.map(async (candidate) => {
        const bundles = await client
          .listEvents(lookupQuery(candidate))
          .catch(() => []);
        return bundles.some(
          (b) =>
            b.signedEvent && bytesToHex(b.signedEvent.signature) === target,
        )
          ? candidate
          : null;
      }),
    ).then((hits) => {
      if (cancelled) return;
      setResolved({ target, lookup: hits.find((h) => h != null) ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [target, bySigner, keys.length, client]);

  if (!target) return null;
  if (bySigner) return previousLookup;
  return resolved?.target === target ? resolved.lookup : null;
}

// --- Helpers ---

function verifySignature(
  signedEvent: v2.SignedEvent,
  signer: v2.PublicKey | undefined,
): boolean {
  if (!signer || signer.keyType !== v2.KeyType.ED25519) return false;
  return (
    tryOrNull(() =>
      ed25519.verify(signedEvent.signature, signedEvent.eventBytes, signer.key),
    ) ?? false
  );
}

function decodeIdentity(bundle: v2.EventBundle | null): v2.Identity | null {
  const bytes = bundle?.serializedContent?.contentBytes;
  if (!bytes) return null;
  const content = tryOrNull(() => v2.Content.fromBinary(bytes));
  return content?.contentBody.oneofKind === 'identity'
    ? content.contentBody.identity
    : null;
}

function sameKey(a: v2.PublicKey, b: v2.PublicKey): boolean {
  return a.keyType === b.keyType && bytesToHex(a.key) === bytesToHex(b.key);
}

function hexOrNone(bytes?: Uint8Array): string {
  return bytes && bytes.length > 0 ? bytesToHex(bytes) : 'None';
}

function keyTypeName(type?: v2.KeyType): string {
  return type === v2.KeyType.ED25519 ? 'Ed25519' : 'Unknown';
}

function digestTypeName(type?: v2.ContentDigestType): string {
  return type === v2.ContentDigestType.SHA256 ? 'SHA-256' : 'Unknown';
}

function collectionName(collection: number): string {
  return COLLECTION_NAMES[collection]
    ? `${COLLECTION_NAMES[collection]} (${collection})`
    : String(collection);
}

function linkStyle(theme: Theme): TextStyle {
  return {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: theme.palette.neutral_300,
  };
}

// --- Layout ---

function EventNav({
  sequence,
  previous,
  next,
  onPrevious,
  onNext,
}: {
  sequence: bigint;
  previous: SignedEventResult;
  next: SignedEventResult;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  return (
    <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}>
      <NavSide
        direction="previous"
        sequence={sequence - 1n}
        result={previous}
        onPress={onPrevious}
      />
      <NavSide
        direction="next"
        sequence={sequence + 1n}
        result={next}
        onPress={onNext}
      />
    </View>
  );
}

function NavSide({
  direction,
  sequence,
  result,
  onPress,
}: {
  direction: 'previous' | 'next';
  sequence: bigint;
  result: SignedEventResult;
  onPress?: () => void;
}) {
  const isNext = direction === 'next';
  const align = isNext ? Atoms.justify_end : Atoms.justify_start;
  const [checking, setChecking] = useState(false);

  if (!onPress || (!isNext && !result.isLoading && !result.signedEvent)) {
    return (
      <View style={[Atoms.flex_1, Atoms.flex_row, Atoms.items_center, align]}>
        <Text variant="small" color="neutral_500">
          {isNext ? 'Latest event' : 'First event'}
        </Text>
      </View>
    );
  }

  const loading = result.isLoading || checking;
  const prefix = result.signedEvent
    ? `${bytesToHex(result.signedEvent.signature).slice(0, 8)}…`
    : null;
  const chevron = (
    <Icon
      name={isNext ? 'chevronForward' : 'chevronBack'}
      size={18}
      color="neutral_500"
    />
  );

  // A newer event may exist by now.
  const checkForNext = async () => {
    setChecking(true);
    const bundle = await result.refetch();
    setChecking(false);
    if (bundle) onPress();
    else toast.info('This is the latest event');
  };

  return (
    <Pressable
      onPress={prefix ? onPress : checkForNext}
      disabled={loading}
      accessibilityRole="link"
      accessibilityLabel={
        prefix
          ? `Open ${direction} event, sequence ${sequence}`
          : 'Check for next event'
      }
      style={[
        Atoms.flex_1,
        Atoms.flex_row,
        Atoms.items_center,
        align,
        Atoms.gap_xs,
      ]}
    >
      {({ pressed }) => (
        <>
          {!isNext && chevron}
          {loading ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text
              variant="small"
              color="neutral_700"
              style={[prefix != null && MONO, pressed && PRESSED]}
            >
              {prefix ? `${prefix} (${sequence})` : 'Next'}
            </Text>
          )}
          {isNext && chevron}
        </>
      )}
    </Pressable>
  );
}

/** Collapsible protobuf-as-JSON view. */
function RawBlock({
  label,
  json,
  loading,
}: {
  label: string;
  json: string | null;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { copyToClipboard, justCopied } = useCopyToClipboard({
    showToast: true,
  });

  if (!json) {
    return (
      <Text variant="small" color="neutral_500">
        {loading ? `Loading ${label}…` : `No ${label} available`}
      </Text>
    );
  }

  return (
    <View style={Atoms.gap_xs}>
      <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}>
        <LinkText
          variant="small"
          fontWeight="semibold"
          color="neutral_700"
          role="button"
          onPress={() => setOpen((o) => !o)}
        >
          {open ? `Hide ${label}` : `Show ${label}`}
        </LinkText>
        {open ? (
          <CopyIcon
            label={`Copy ${label}`}
            copied={justCopied}
            onPress={() => copyToClipboard(json)}
          />
        ) : null}
      </View>
      {open ? (
        <Text
          variant="small"
          selectable
          style={[
            MONO,
            isWeb && ({ whiteSpace: 'pre-wrap' } as unknown as TextStyle),
          ]}
        >
          {json}
        </Text>
      ) : null}
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={Atoms.gap_sm}>
      <Text variant="small" color="neutral_500">
        {title.toUpperCase()}
      </Text>
      <View
        style={[
          Atoms.gap_md,
          Atoms.p_md,
          Atoms.rounded_md,
          {
            backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  note,
  onPress,
  children,
}: {
  label: string;
  value: string;
  note?: string;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  const { copyToClipboard, justCopied } = useCopyToClipboard({
    showToast: true,
  });
  const valueStyle: StyleProp<TextStyle> = [
    MONO,
    { minWidth: 0 },
    isWeb && ({ wordBreak: 'break-all' } as unknown as TextStyle),
  ];
  return (
    <View style={Atoms.gap_xs}>
      <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}>
        <Text variant="small" color="neutral_500" style={Atoms.flex_1}>
          {label}
        </Text>
        {children}
      </View>
      <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}>
        {onPress ? (
          <LinkText
            variant="secondary"
            style={valueStyle}
            accessibilityLabel={`Open ${label.toLowerCase()}`}
            onPress={onPress}
          >
            {value}
          </LinkText>
        ) : (
          <Text
            variant="secondary"
            style={[Atoms.flex_1, valueStyle]}
            selectable
          >
            {value}
          </Text>
        )}
        <CopyIcon
          label={`Copy ${label.toLowerCase()}`}
          copied={justCopied}
          onPress={() => copyToClipboard(value)}
        />
      </View>
      {note ? (
        <Text variant="small" color="neutral_500">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function LinkText({
  onPress,
  role = 'link',
  accessibilityLabel,
  style,
  children,
  ...text
}: Pick<ComponentProps<typeof Text>, 'variant' | 'fontWeight' | 'color'> & {
  onPress: () => void;
  role?: 'link' | 'button';
  accessibilityLabel?: string;
  style?: StyleProp<TextStyle>;
  children: string;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      style={Atoms.flex_1}
    >
      {({ pressed }) => (
        <Text {...text} style={[style, linkStyle(theme), pressed && PRESSED]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

// Icon-sized, unlike IconButton, so single-line rows don't grow.
function CopyIcon({
  label,
  copied,
  onPress,
}: {
  label: string;
  copied: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {({ pressed }) => (
        <Icon
          name={copied ? 'checkmark' : 'copy'}
          size={16}
          color={copied ? 'positive_500' : 'neutral_500'}
          style={pressed && PRESSED}
        />
      )}
    </Pressable>
  );
}

type StatusTone = Extract<
  PaletteColorToken,
  'positive_500' | 'negative_500' | 'neutral_500'
>;

function StatusChip({ label, tone }: { label: string; tone: StatusTone }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.gap_2xs,
        Atoms.px_sm,
        Atoms.py_xs,
        Atoms.rounded_full,
        { backgroundColor: withHexOpacity(theme.palette[tone], '20') },
      ]}
    >
      <Icon
        name={tone === 'positive_500' ? 'checkmarkCircle' : 'closeCircle'}
        size={14}
        color={tone}
      />
      <Text variant="small" fontWeight="semibold" color={tone}>
        {label}
      </Text>
    </View>
  );
}
