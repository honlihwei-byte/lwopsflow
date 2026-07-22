import Image from "next/image";
import Link from "next/link";

export const BRAND_LOGO_PATH = "/images/lwopsflow-logo.png";

/** Source asset is 1536×1024 (3:2). */
const LOGO_ASPECT = 1.5;

export type BrandLogoSize = "nav" | "nav-mobile" | "login" | "hero";

const HEIGHT: Record<BrandLogoSize, number> = {
  nav: 36,
  "nav-mobile": 30,
  login: 64,
  hero: 80,
};

type Props = {
  size?: BrandLogoSize;
  height?: number;
  href?: string;
  className?: string;
  priority?: boolean;
};

export function BrandLogo({
  size = "nav",
  height,
  href,
  className = "",
  priority = false,
}: Props) {
  const h = height ?? HEIGHT[size];
  const w = Math.round(h * LOGO_ASPECT);

  const img = (
    <Image
      src={BRAND_LOGO_PATH}
      alt="LW OpsFlow"
      width={w}
      height={h}
      priority={priority}
      sizes={`${w}px`}
      className={`h-auto w-auto max-w-none object-contain ${className}`}
      style={{ height: h, width: "auto" }}
    />
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0 items-center" aria-label="LW OpsFlow home">
        {img}
      </Link>
    );
  }

  return img;
}
