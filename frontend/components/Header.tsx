const LETTERS = ["R", "A", "V", "E", "N"];

export default function Header() {
  return (
    <header className="border-b-4 border-[var(--accent)] bg-[var(--navy)] text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-7">
        <div className="flex items-center gap-3">
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
          <span className="hidden border-l border-white/30 pl-3 text-sm text-white/80 md:inline">
            ASL sign model
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
          <a href="#about" className="hidden text-white/80 hover:underline sm:inline">
            About Raven
          </a>
          <span className="rounded-full bg-[var(--accent)] px-3 py-0.5 text-xs font-semibold text-[var(--navy)]">
            Research prototype
          </span>
        </nav>
      </div>
    </header>
  );
}