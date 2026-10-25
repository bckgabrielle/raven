export default function Header() {
  return (
    <header className="border-b-4 border-[var(--accent)] bg-[var(--navy)] text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-7">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl bg-white text-2xl"
            role="img"
            aria-label="ASL I love you handshape"
          >
            🤟
          </span>
          <span className="text-2xl font-light tracking-tight">raven</span>
          <span className="hidden border-l border-white/30 pl-3 text-sm text-white/80 md:inline">
            English to ASL studio
          </span>
        </div>
        <nav aria-label="Main" className="flex items-center gap-5 text-sm">
          <a href="#top" aria-current="page" className="border-b-2 border-[var(--accent)] pb-0.5 font-medium">
            Translate
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