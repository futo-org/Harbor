import { useLinkPreviews } from '@/src/common/link-previews';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { parseTextLinks } from '@/src/common/util/parseTextLinks';
import { v2 } from '@polycentric/react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type UseLinkPreviewResult = {
  /** The resolved preview to render, or null when there's nothing to show. */
  linkPreview: v2.Link | null;
  /** True while the target url is being unfurled by the server. */
  linkPreviewLoading: boolean;
  /** X button on the card: drop the current preview and keep it gone. */
  handleRemove: () => void;
  /** Clear all preview state back to a fresh-draft slate. */
  reset: () => void;
  /** Resolve the Link to embed in the signed post (best-effort). */
  resolveLinkForPost: () => Promise<v2.Link | null>;
};

/**
 * The composer's live link-preview state machine, extracted from
 * `useComposer`. Owns everything about spotting a newly typed url, unfurling
 * it via the server, and reusing that resolved Link at post time.
 *
 * The card previews `previewUrl`, which is only ever set by `settlePreviewUrl`
 * spotting a newly typed link, and cleared by `handleRemove` (the X button) or
 * the link leaving the draft — so a removed preview stays removed until the
 * user types another url.
 */
export function useLinkPreview(text: string): UseLinkPreviewResult {
  const client = usePolycentric();
  const { enabled } = useLinkPreviews();

  const [linkPreview, setLinkPreview] = useState<v2.Link | null>(null);
  const [linkPreviewLoading, setLinkPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrlState] = useState<string | null>(null);
  // Mirror of `previewUrl` so `settlePreviewUrl` can read and return the
  // target synchronously (the post path can't wait for a re-render).
  const previewUrlRef = useRef<string | null>(null);
  const setPreviewUrl = useCallback((url: string | null) => {
    previewUrlRef.current = url;
    setPreviewUrlState(url);
  }, []);

  // Every url in the draft, in order, duplicates kept.
  const textLinks = useMemo(
    () =>
      parseTextLinks(text)
        .filter((s) => s.type === 'link')
        .map((s) => s.url),
    [text],
  );

  // The draft's urls as of the last settle (or preview removal): the baseline
  // the next settle diffs against to spot newly typed links.
  const settledLinksRef = useRef<string[]>([]);

  // Diff the draft's urls against the baseline; a url the baseline doesn't
  // account for was just typed — an appended link, an old link edited into a
  // new spelling, or a deleted link retyped — and becomes the preview target
  // if and only if there is no target already. Runs post-debounce (and at
  // post time), so intermediate spellings never enter the baseline.
  const settlePreviewUrl = useCallback((): string | null => {
    // Multiset diff: each current url consumes one baseline occurrence, so a
    // duplicate of an existing link still counts as new.
    const remaining = new Map<string, number>();
    for (const url of settledLinksRef.current) {
      remaining.set(url, (remaining.get(url) ?? 0) + 1);
    }
    let typedUrl: string | null = null;
    for (const url of textLinks) {
      const count = remaining.get(url) ?? 0;
      if (count === 0) typedUrl = typedUrl ?? url;
      else remaining.set(url, count - 1);
    }
    settledLinksRef.current = textLinks;
    if (!previewUrlRef.current && typedUrl) setPreviewUrl(typedUrl);
    return previewUrlRef.current;
  }, [textLinks, setPreviewUrl]);

  // Debounce the settle so we don't adopt every intermediate url while the
  // user is still typing it. The previewed link leaving the draft clears the
  // card immediately, though — a deleted link shouldn't keep its preview.
  useEffect(() => {
    if (previewUrlRef.current && !textLinks.includes(previewUrlRef.current)) {
      setPreviewUrl(null);
      setLinkPreview(null);
      setLinkPreviewLoading(false);
    }
    const handle = setTimeout(settlePreviewUrl, 1000);
    return () => clearTimeout(handle);
  }, [textLinks, settlePreviewUrl, setPreviewUrl]);

  // Unfurl the target via the server. No extra debounce: targets only change
  // on settle, which is already debounced.
  useEffect(() => {
    if (!previewUrl || !enabled) {
      setLinkPreview(null);
      setLinkPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setLinkPreviewLoading(true);
    void client.urlInfo(previewUrl).then((info) => {
      if (cancelled) return;
      // The endpoint returns metadata only; attach the URL we requested.
      setLinkPreview(
        info ? v2.Link.create({ ...info, url: previewUrl }) : null,
      );
      setLinkPreviewLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [previewUrl, client, enabled]);

  // Start the next draft with a clean preview slate: no target, and an empty
  // baseline so its first link diffs as new.
  const reset = useCallback(() => {
    settledLinksRef.current = [];
    setPreviewUrl(null);
    setLinkPreview(null);
    setLinkPreviewLoading(false);
  }, [setPreviewUrl]);

  // X button on the link preview (loading or resolved): clear the target and
  // fold the draft's current links into the baseline, so they can never diff
  // as new again — only typing another url brings a preview back.
  const handleRemove = useCallback(() => {
    settledLinksRef.current = textLinks;
    setPreviewUrl(null);
    setLinkPreview(null);
    setLinkPreviewLoading(false);
  }, [textLinks, setPreviewUrl]);

  // Resolve the Link to embed in the signed post. Settle now so a url typed
  // within the debounce window still gets its preview (and a removed preview
  // stays removed — its links are already baselined, so the diff yields
  // nothing). Reuse the live preview when it matches; otherwise fetch fresh.
  // Best-effort — null yields no card.
  const resolveLinkForPost = useCallback(async (): Promise<v2.Link | null> => {
    if (!enabled) return null;
    const targetUrl = settlePreviewUrl();
    if (!targetUrl) return null;
    if (linkPreview && linkPreview.url === targetUrl) return linkPreview;
    const info = await client.urlInfo(targetUrl);
    // Metadata-only response; populate the URL we requested.
    return info ? v2.Link.create({ ...info, url: targetUrl }) : null;
  }, [enabled, settlePreviewUrl, linkPreview, client]);

  return {
    linkPreview,
    linkPreviewLoading,
    handleRemove,
    reset,
    resolveLinkForPost,
  };
}
