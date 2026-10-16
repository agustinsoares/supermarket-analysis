import NavLinks from "@/components/NavLinks";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <a className="brand" href="/">
            <span className="brand-dot" aria-hidden>🛒</span>
            <span className="name">Supermarket</span>
          </a>
          <NavLinks />
          <form className="logout" action="/api/logout" method="post">
            <button className="btn small" type="submit">Salir</button>
          </form>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
