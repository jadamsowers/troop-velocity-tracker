import React from "react";

/** Navy oval patch with a rising trail: the app's flat mark. */
export const BrandMark: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg
    className="brand-mark"
    width={size}
    height={(size * 4) / 3}
    viewBox="0 0 24 32"
    aria-hidden
  >
    <ellipse cx="12" cy="16" rx="11" ry="15" fill="var(--brand-blue)" />
    <ellipse
      cx="12"
      cy="16"
      rx="8.8"
      ry="12.8"
      fill="none"
      stroke="var(--brand-tan)"
      strokeOpacity="0.55"
      strokeWidth="0.8"
      strokeDasharray="1.2 1.4"
    />
    <path
      d="M6.5 21.5 10.5 16l2.6 2.6L17.5 11"
      fill="none"
      stroke="var(--brand-tan)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M14.4 10.4h3.6V14" fill="none" stroke="var(--brand-tan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
