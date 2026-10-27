const LETTERS = ["R", "A", "V", "E", "N"];

export default function Header() {
  return (
    <header className="site-header">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-7">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5" role="img" aria-label="raven">
            {LETTERS.map((letter) => (
              <span key={letter} aria-hidden className="tile">
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
          </a>
        </nav>
      </div>
    </header>
  );
}