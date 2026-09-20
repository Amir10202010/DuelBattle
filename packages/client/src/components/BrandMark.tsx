/** The supplied DB monogram, shared by every entry point. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return <img className="brand-mark" src="/brand.svg" width={size} height={size} alt="" aria-hidden="true" />;
}
