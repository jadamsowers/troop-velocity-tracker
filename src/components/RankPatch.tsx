import React from "react";

export type PatchState = "earned" | "projected" | "late" | "none";

interface Props {
  rank: string;
  state?: PatchState;
  /** Rendered width in px; height follows the 3:4 oval. */
  size?: number;
  title?: string;
}

// Simplified rank insignia, drawn on a 24×24 grid.
const fleur = (
  <>
    <path d="M12 2.5c1.9 2.2 2.6 4.6 2.1 7-.3 1.5-1 2.7-2.1 3.7-1.1-1-1.8-2.2-2.1-3.7-.5-2.4.2-4.8 2.1-7z" />
    <path d="M10.6 13.2c-2.2.4-4.9-.6-5.8-2.8-.6-1.6.4-3.2 1.9-3.1 1.2.1 1.7 1.2 1.2 2.2-.3.6-.1 1.4.6 1.8.8.5 1.6.6 2.4.6z" />
    <path d="M13.4 13.2c2.2.4 4.9-.6 5.8-2.8.6-1.6-.4-3.2-1.9-3.1-1.2.1-1.7 1.2-1.2 2.2.3.6.1 1.4-.6 1.8-.8.5-1.6.6-2.4.6z" />
    <path d="M7.5 13.6h9v1.8h-9z" />
    <path d="M10.6 15.4h2.8l-.4 3.2 1.6 2.4h-1.8L12 19.6 11.2 21H9.4l1.6-2.4z" />
  </>
);

const scroll = (
  <path d="M3 9.5 5.5 8v1.5h13V8L21 9.5v5L18.5 16v-1.5h-13V16L3 14.5z" />
);

const GLYPHS: Record<string, React.ReactNode> = {
  Scout: fleur,
  Tenderfoot: (
    <>
      {fleur}
      <circle cx="4" cy="4.5" r="1.4" />
      <circle cx="20" cy="4.5" r="1.4" />
    </>
  ),
  "Second Class": scroll,
  "First Class": (
    <>
      <g transform="translate(3.6 0) scale(0.7)">{fleur}</g>
      <g transform="translate(0 8.6) scale(1 0.8)">{scroll}</g>
    </>
  ),
  Star: <path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6L12 16.2l-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z" />,
  Life: (
    <path d="M12 20.5S3.5 15.3 3.5 9.3c0-2.7 2.1-4.8 4.6-4.8 1.6 0 3 .8 3.9 2.1.9-1.3 2.3-2.1 3.9-2.1 2.5 0 4.6 2.1 4.6 4.8 0 6-8.5 11.2-8.5 11.2z" />
  ),
  Eagle: (
    <path d="M12 7c1 0 1.6.7 1.6 1.5L16 7.2c2-1 4.5-2.2 7-2.2-1.2 1.5-2.8 3-5 3.8 1.6 0 2.8-.3 4-.9-1.4 1.9-3.6 3-6.2 3.2l-1.6 1 1.2 4.4-2.4-1.6-2.4 1.6 1.2-4.4-1.6-1C7.6 10.9 5.4 9.8 4 7.9c1.2.6 2.4.9 4 .9-2.2-.8-3.8-2.3-5-3.8 2.5 0 5 1.2 7 2.2l2.4 1.3C10.4 7.7 11 7 12 7z" />
  ),
};

/**
 * An oval rank patch, the app's signature mark. Earned ranks are sewn on
 * (khaki twill, stitched rim, navy insignia); projected ranks are an outline
 * of where the patch will go.
 */
export const RankPatch: React.FC<Props> = ({
  rank,
  state = "earned",
  size = 18,
  title,
}) => {
  const sewn = state === "earned";
  const glyph = GLYPHS[rank] ?? fleur;
  return (
    <svg
      className={`rank-patch rank-patch--${state}`}
      width={size}
      height={(size * 4) / 3}
      viewBox="0 0 24 32"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <ellipse
        cx="12"
        cy="16"
        rx="11"
        ry="15"
        className="rank-patch__body"
        fill={sewn ? "var(--patch-fill)" : "var(--surface)"}
        stroke={sewn ? "var(--patch-rim)" : "currentColor"}
        strokeWidth={sewn ? 1.5 : 1.25}
        strokeDasharray={sewn ? undefined : "2.4 2"}
      />
      {sewn && (
        <ellipse
          cx="12"
          cy="16"
          rx="8.8"
          ry="12.8"
          fill="none"
          stroke="var(--patch-stitch)"
          strokeWidth="0.8"
          strokeDasharray="1.2 1.4"
        />
      )}
      <g
        transform="translate(4.5 8.5) scale(0.625)"
        fill={sewn ? "var(--patch-glyph)" : "currentColor"}
        opacity={sewn ? 1 : 0.7}
      >
        {glyph}
      </g>
    </svg>
  );
};
