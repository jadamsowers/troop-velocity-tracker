import React, { useId } from "react";

export type PatchState = "earned" | "projected" | "late" | "none";

interface Props {
  rank: string;
  state?: PatchState;
  /** Rendered width in px; height follows the 3:4 oval. */
  size?: number;
  title?: string;
}

// Embroidery thread colors, matched to the cloth rank patches
const C = {
  twill: "#D9CBA6",
  rim: "#A88F62",
  rimEdge: "#7E6A45",
  gold: "#F4C21A",
  goldEdge: "#8A5E00",
  orange: "#EE9F3A",
  orangeDark: "#C97A1E",
  orangeEdge: "#7A4510",
  brown: "#3B2B20",
  red: "#C8102E",
  redEdge: "#7D0A1C",
  white: "#FFFFFF",
  navy: "#1F3B7A",
  silver: "#D3D8DE",
  silverEdge: "#5E6772",
  eagleBlue: "#1F4F9A",
};

// Patch art is drawn at sizes from ~20px to ~72px, so every emblem is a
// bold silhouette with a dark outline (stroke painted under the fill) rather
// than fine detail that turns to mush when small.
const outline = (edge: string, width = 2) =>
  ({ stroke: edge, strokeWidth: width, strokeLinejoin: "round", paintOrder: "stroke" }) as const;

// Emblem paths are drawn on a 32×32 grid and placed with transforms.
const MIRROR = "matrix(-1 0 0 1 32 0)";

const FLEUR_PETAL_CENTER =
  "M16 1C20 5.5 21 10.5 19 15.5L17.6 18.5H14.4L13 15.5C11 10.5 12 5.5 16 1Z";
const FLEUR_PETAL_SIDE =
  "M13.6 18.6C9.5 19.6 4.5 18.2 2.6 14 1.4 11.2 2.8 8.4 5.6 8.4 7.8 8.4 9 10.2 8.4 12 8 13.3 8.8 14.6 10.4 15 11.6 15.3 12.8 15.1 13.6 14.6Z";
const FLEUR_BAND = "M9.5 17.4H22.5V21.2H9.5Z";
const FLEUR_FOOT =
  "M14 21.2H18L18.2 24C20.2 24.8 21.8 26.6 22 29L19 28.4C18.4 27 17.3 26.2 16 26.2 14.7 26.2 13.6 27 13 28.4L10 29C10.2 26.6 11.8 24.8 13.8 24Z";

const SCROLL_BAND = "M5 12Q16 19.5 27 12V17.6Q16 25.1 5 17.6Z";
const SCROLL_TAB = "M5.4 12.2 0.6 10.4 2.6 15 0.6 19.6 5.4 17.8Z";

const EAGLE =
  "M16 5C17.6 5 18.6 6.2 18.4 7.6L19.4 9.6C22 8 25.5 6 30.5 5.4 29 7.6 27 9.4 24.4 10.4 26.4 10.4 28.2 10 29.6 9.4 27.8 12 25 13.6 21.6 14L19 15.4 20.6 21.6 16 19 11.4 21.6 13 15.4 10.4 14C7 13.6 4.2 12 2.4 9.4 3.8 10 5.6 10.4 7.6 10.4 5 9.4 3 7.6 1.5 5.4 6.5 6 10 8 12.6 9.6L13.6 7.6C13.4 6.2 14.4 5 16 5Z";

const starPoints = (cx: number, cy: number, R: number, r: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    return `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

/** Fleur-de-lis on the 32×32 grid. `edge={null}` draws a flat silhouette. */
const Fleur: React.FC<{ fill?: string; edge?: string | null }> = ({
  fill = C.gold,
  edge = C.goldEdge,
}) => (
  <g fill={fill} {...(edge ? outline(edge) : {})}>
    <path d={FLEUR_PETAL_SIDE} />
    <path d={FLEUR_PETAL_SIDE} transform={MIRROR} />
    <path d={FLEUR_FOOT} />
    <path d={FLEUR_PETAL_CENTER} />
    <path d={FLEUR_BAND} />
  </g>
);

/** Tenderfoot additions: eagle spread across the fleur with the US shield. */
const EagleOverFleur: React.FC = () => (
  <>
    <path d="M16 13.2C19.4 11.4 23.8 10.4 28.4 11 25.8 13.4 22.4 14.8 18.8 15.2Z" fill={C.brown} />
    <path d="M16 13.2C19.4 11.4 23.8 10.4 28.4 11 25.8 13.4 22.4 14.8 18.8 15.2Z" fill={C.brown} transform={MIRROR} />
    <path d="M12.8 12.6H19.2V17.6C19.2 19.9 17.6 21.2 16 22 14.4 21.2 12.8 19.9 12.8 17.6Z" fill={C.white} {...outline(C.brown, 1.4)} />
    <path d="M12.8 12.6H19.2V15H12.8Z" fill={C.navy} />
    <path d="M14.4 15V20.4M16 15V21.4M17.6 15V20.4" stroke={C.red} strokeWidth="1.1" />
  </>
);

/** "Be Prepared" scroll with the knot hanging below (32×32 grid). */
const Scroll: React.FC<{ fill?: string; edge?: string | null }> = ({
  fill,
  edge = C.orangeEdge,
}) => (
  <g {...(edge ? outline(edge) : {})}>
    <path d={SCROLL_TAB} fill={fill ?? C.orangeDark} />
    <path d={SCROLL_TAB} fill={fill ?? C.orangeDark} transform={MIRROR} />
    <path d={SCROLL_BAND} fill={fill ?? C.orange} />
    <g fill="none" stroke={fill ?? (edge || C.orangeEdge)} strokeWidth="1.6" strokeLinecap="round" paintOrder="normal">
      <path d="M16 21.6V25" />
      <circle cx="16" cy="26.9" r="1.9" />
      <path d="M16 28.8V31" />
    </g>
  </g>
);

/** Fleur over the scroll: the First Class emblem, also reused inside Star and Life. */
const FirstClassEmblem: React.FC<{ color?: string }> = ({ color }) =>
  color ? (
    <>
      <g transform="translate(4 0) scale(0.75)">
        <Fleur fill={color} edge={null} />
      </g>
      <g transform="translate(2 13) scale(0.875)">
        <Scroll fill={color} edge={null} />
      </g>
    </>
  ) : (
    <>
      <g transform="translate(4 0) scale(0.75)">
        <Fleur />
        <EagleOverFleur />
      </g>
      <g transform="translate(2 13) scale(0.875)">
        <Scroll />
      </g>
    </>
  );

// Patch geometry on the 48×64 viewBox.
const CX = 24;
const CY = 32;

const TanPatch: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    <ellipse cx={CX} cy={CY} rx="22.75" ry="30.75" fill={C.rim} stroke={C.rimEdge} strokeWidth="1.5" />
    <ellipse cx={CX} cy={CY} rx="19.5" ry="27.5" fill={C.twill} />
    {children}
  </>
);

const EaglePatch: React.FC<{ clipId: string }> = ({ clipId }) => (
  <>
    <ellipse cx={CX} cy={CY} rx="22.75" ry="30.75" fill={C.silver} stroke={C.silverEdge} strokeWidth="1.5" />
    <ellipse cx={CX} cy={CY} rx="19.6" ry="27.6" fill={C.red} />
    <polygon points={starPoints(7.4, CY, 2.9, 1.2)} fill={C.white} />
    <polygon points={starPoints(40.6, CY, 2.9, 1.2)} fill={C.white} />
    <clipPath id={clipId}>
      <ellipse cx={CX} cy={CY} rx="12.6" ry="21" />
    </clipPath>
    <g clipPath={`url(#${clipId})`}>
      <rect x="11" y="10" width="8.8" height="44" fill={C.red} />
      <rect x="19.8" y="10" width="8.4" height="44" fill={C.white} />
      <rect x="28.2" y="10" width="9" height="44" fill={C.eagleBlue} />
    </g>
    <ellipse cx={CX} cy={CY} rx="12.6" ry="21" fill="none" stroke={C.silver} strokeWidth="1.6" />
    <path d={EAGLE} transform="translate(5.6 9) scale(1.15)" fill={C.silver} {...outline(C.brown, 1.8)} />
    <path
      d="M12.6 41.6Q24 46.4 35.4 41.6V46.4Q24 51.2 12.6 46.4Z"
      fill={C.eagleBlue}
      {...outline(C.white, 1.6)}
    />
  </>
);

/**
 * A cloth rank patch, the app's signature mark. Earned ranks show the
 * patch in its thread colors; projected ranks are a faded, desaturated
 * patch where it will go.
 */
export const RankPatch: React.FC<Props> = ({
  rank,
  state = "earned",
  size = 18,
  title,
}) => {
  const uid = useId();
  const clipId = `${uid}clip`;
  const fadeId = `${uid}fade`;
  const faded = state === "projected" || state === "late";

  let art: React.ReactNode;
  switch (rank) {
    case "Tenderfoot":
      art = (
        <TanPatch>
          <g transform="translate(6 13) scale(1.125)">
            <Fleur />
            <EagleOverFleur />
            <polygon points={starPoints(5.4, 12.6, 1.9, 0.8)} fill={C.brown} />
            <polygon points={starPoints(26.6, 12.6, 1.9, 0.8)} fill={C.brown} />
          </g>
        </TanPatch>
      );
      break;
    case "Second Class":
      art = (
        <TanPatch>
          <g transform="translate(6 12) scale(1.125)">
            <Scroll />
          </g>
        </TanPatch>
      );
      break;
    case "First Class":
      art = (
        <TanPatch>
          <g transform="translate(6.4 9) scale(1.1)">
            <FirstClassEmblem />
          </g>
        </TanPatch>
      );
      break;
    case "Star":
      art = (
        <TanPatch>
          <polygon points={starPoints(CX, 34.5, 19.5, 8.4)} fill={C.gold} {...outline(C.goldEdge, 2.2)} />
          <g transform="translate(17.6 26) scale(0.4)">
            <FirstClassEmblem color={C.goldEdge} />
          </g>
        </TanPatch>
      );
      break;
    case "Life":
      art = (
        <TanPatch>
          <path
            d="M24 53C13.4 45.4 7 38.2 7 28.6 7 21.6 11.8 16.6 17.8 16.6 20.4 16.6 22.6 17.8 24 19.8 25.4 17.8 27.6 16.6 30.2 16.6 36.2 16.6 41 21.6 41 28.6 41 38.2 34.6 45.4 24 53Z"
            fill={C.red}
            {...outline(C.redEdge, 2.2)}
          />
          <g transform="translate(15.2 21) scale(0.55)">
            <FirstClassEmblem color={C.gold} />
          </g>
        </TanPatch>
      );
      break;
    case "Eagle":
      art = <EaglePatch clipId={clipId} />;
      break;
    default:
      art = (
        <TanPatch>
          <g transform="translate(6 13) scale(1.125)">
            <Fleur />
          </g>
        </TanPatch>
      );
  }

  return (
    <svg
      className={`rank-patch rank-patch--${state}`}
      width={size}
      height={(size * 4) / 3}
      viewBox="0 0 48 64"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {faded && (
        <filter id={fadeId}>
          <feColorMatrix type="saturate" values="0.35" />
        </filter>
      )}
      {state === "none" ? (
        <ellipse
          cx={CX}
          cy={CY}
          rx="22"
          ry="30"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray="4.8 4"
        />
      ) : (
        <g filter={faded ? `url(#${fadeId})` : undefined} opacity={faded ? 0.6 : 1}>
          {art}
        </g>
      )}
      {state === "late" && (
        <ellipse cx={CX} cy={CY} rx="22.75" ry="30.75" fill="none" stroke="var(--red)" strokeWidth="3" />
      )}
    </svg>
  );
};
