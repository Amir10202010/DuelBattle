import { useEffect, useRef } from 'react';
/** Finite reveals; content remains visible without observer support. */
export function useLandingMotion() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = root.current;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!element || !('IntersectionObserver' in window)) return;
    let observer: IntersectionObserver | undefined;
    const configure = () => {
      observer?.disconnect();
      element
        .querySelectorAll('[data-reveal]')
        .forEach((node) => node.classList.remove('lp-will-reveal'));
      if (media.matches) return;
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(({ target, isIntersecting }) => {
            if (isIntersecting) {
              target.classList.remove('lp-will-reveal');
              observer?.unobserve(target);
            }
          });
        },
        { threshold: 0.08 },
      );
      element.querySelectorAll('[data-reveal]').forEach((node) => {
        if (node.getBoundingClientRect().top > window.innerHeight) {
          node.classList.add('lp-will-reveal');
          observer?.observe(node);
        }
      });
    };
    configure();
    media.addEventListener('change', configure);
    return () => {
      observer?.disconnect();
      media.removeEventListener('change', configure);
    };
  }, []);
  return root;
}
