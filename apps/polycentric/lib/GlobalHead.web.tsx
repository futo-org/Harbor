import { useEffect } from 'react';

/**
 * Injects favicon and Open Graph meta tags into document.head.
 * Web-only; use GlobalHead.tsx for native (no-op).
 */
export function GlobalHead() {
  useEffect(() => {
    const head = document.head;

    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.href = '/favicon.ico';
    head.appendChild(favicon);

    const ogType = document.createElement('meta');
    ogType.setAttribute('property', 'og:type');
    ogType.content = 'website';
    head.appendChild(ogType);

    const ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    ogTitle.content = 'Polycentric';
    head.appendChild(ogTitle);

    const ogDesc = document.createElement('meta');
    ogDesc.setAttribute('property', 'og:description');
    ogDesc.content = 'Decentralized social.';
    head.appendChild(ogDesc);

    const ogImage = document.createElement('meta');
    ogImage.setAttribute('property', 'og:image');
    ogImage.content = '/polycentric-preview-card.png';
    head.appendChild(ogImage);

    return () => {
      head.removeChild(favicon);
      head.removeChild(ogType);
      head.removeChild(ogTitle);
      head.removeChild(ogDesc);
      head.removeChild(ogImage);
    };
  }, []);

  return null;
}
