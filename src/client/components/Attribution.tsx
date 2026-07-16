// Legal/attribution footer. Required by the TMDB and TheTVDB API terms (logo +
// "not endorsed" notice), plus an independence disclaimer for the TV Time name.

function TmdbLogo() {
  return (
    <svg
      width="80"
      height="10"
      viewBox="0 0 273 35"
      role="img"
      aria-label="TMDB"
    >
      <defs>
        <linearGradient id="tmdbg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#90cea1" />
          <stop offset="0.56" stopColor="#3cbec9" />
          <stop offset="1" stopColor="#00b3e5" />
        </linearGradient>
      </defs>
      <rect width="273" height="35" rx="6" fill="url(#tmdbg)" />
      <text
        x="136.5"
        y="25"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="22"
        fill="#fff"
        letterSpacing="1"
      >
        TMDB
      </text>
    </svg>
  );
}

export function Attribution() {
  return (
    <footer className="attribution">
      <p>
        <strong>rip tv time</strong> is an independent, open-source project. It
        is <strong>not affiliated with, endorsed by, or connected to</strong> TV
        Time or Whip Media. “TV Time” is a trademark of its respective owner; it
        is referenced only to describe the data this app imports.
      </p>
      <div className="attribution-logos">
        <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
          <TmdbLogo />
        </a>
        <span>
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </span>
      </div>
      <p>
        Metadata and artwork provided by{" "}
        <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
          TMDB
        </a>{" "}
        and{" "}
        <a href="https://thetvdb.com/" target="_blank" rel="noreferrer">
          TheTVDB
        </a>{" "}
        (fetched live via their APIs; nothing is redistributed by this app).
      </p>
      <p>
        Your email is used only to send a sign-in link. Your library is private
        to your account and is never shared.
      </p>
    </footer>
  );
}
