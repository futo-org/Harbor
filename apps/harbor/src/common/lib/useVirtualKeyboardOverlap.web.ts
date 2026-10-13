import { useEffect, useState } from 'react';

// Keyboard avoiding for web
export function useVirtualKeyboardOverlap(): number {
  const [keyboardOverlap, setKeyboardOverlap] = useState(0);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const updateKeyboardOverlap = () => {
      setKeyboardOverlap(
        Math.max(
          0,
          Math.round(
            document.documentElement.clientHeight -
              visualViewport.height * visualViewport.scale,
          ),
        ),
      );
    };

    updateKeyboardOverlap();
    visualViewport.addEventListener('resize', updateKeyboardOverlap);
    return () =>
      visualViewport.removeEventListener('resize', updateKeyboardOverlap);
  }, []);

  return keyboardOverlap;
}
