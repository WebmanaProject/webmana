import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Favicon: the Webmana hexagon mark on a dark tile, matching <Logo /> and webmana.dev.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#04261C",
          borderRadius: 7,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
          <path
            d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25L16 2.5Z"
            fill="rgba(0,255,170,0.16)"
            stroke="#00FFAA"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          <path
            d="M16 6.5v19M7.5 11v10M24.5 11v10"
            stroke="#00FFAA"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.6"
          />
          <circle cx="16" cy="16" r="3.2" fill="#00FFAA" stroke="#04261C" strokeWidth="1" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
