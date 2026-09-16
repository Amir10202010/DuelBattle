import type { AnchorHTMLAttributes } from 'react';
type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  onNavigate: (path: string) => void;
};
/** Preserve ordinary links, including modified clicks and opening a new tab. */
export function LandingLink({ href, onNavigate, children, ...props }: Props) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        onNavigate(href);
      }}
    >
      {children}
    </a>
  );
}
