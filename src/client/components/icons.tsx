// Minimal inline icon set (stroke = currentColor) for the bottom nav & UI.
type P = { size?: number };
const svg =
  (path: React.ReactNode) =>
  ({ size = 24 }: P) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );

export const HomeIcon = svg(
  <>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </>,
);
export const CalendarIcon = svg(
  <>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </>,
);
// TV set with antennae (Shows tab)
export const TvIcon = svg(
  <>
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <path d="m7 3 5 5 5-5" />
  </>,
);
// Clapperboard (Movies tab) — angled top with diagonal stripes, like TV Time
export const FilmIcon = ({ size = 24 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 8.5 20.2 4l.8 3.5L3.8 12z" />
    <path d="M4 8.2v10.3a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5V7.8" />
    <path d="m8 6.7 2 3.4M13 5.5l2 3.4" />
  </svg>
);
export const SearchIcon = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </>,
);
export const UserIcon = svg(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </>,
);
export const CheckIcon = svg(<path d="M20 6 9 17l-5-5" />);
export const StarIcon = ({
  size = 24,
  filled = false,
}: P & { filled?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinejoin="round"
  >
    <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.6 9.8l6.5-.9L12 3Z" />
  </svg>
);
