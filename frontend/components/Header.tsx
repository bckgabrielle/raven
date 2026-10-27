const LETTERS = ["R", "A", "V", "E", "N"];

export default function Header() {
  return (
    <header className="site-header">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-7">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5" role="img" aria-label="raven">
            {LETTERS.map((letter) => (
              <span key={letter} aria-hidden className="tile">
          <span className="flex gap-1" role="img" aria-label="raven">
            {LETTERS.map((letter) => (
              <span
                key={letter}
                aria-hidden
                className="grid h-7 w-7 place-items-center rounded-md bg-[var(--accent)] text-sm font-bold text-[var(--navy)] md:h-8 md:w-8 md:text-base"
              >
                {letter}
              </span>
            ))}
          </span>
          <span className="muted hidden border-l border-[var(--line-strong)] pl-3 text-sm md:inline">
            English to ASL studio
          </span>
        </div>
        <nav aria-label="Main" className="text-sm">
          <a href="#top" aria-current="page" className="nav-link hidden sm:inline-block">
            Translate
          <span className="hidden border-l border-white/30 pl-3 text-sm text-white/80 md:inline">
            ASL gloss studio
          </span>
        </div>
        <nav aria-label="Main" className="flex items-center gap-5 text-sm">
          <a
            href="#top"
            aria-current="page"
            className="hidden border-b-2 border-[var(--accent)] pb-0.5 font-medium sm:inline-block"
          >
            Explore signs
          </a>
        </nav>
      </div>
    </header>
  );
}