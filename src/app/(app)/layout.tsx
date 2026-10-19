import { cookies } from "next/headers";
import NavLinks from "@/components/NavLinks";
import { COOKIE, usernameFromCookie } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = usernameFromCookie((await cookies()).get(COOKIE)?.value); // el middleware ya verificó la firma
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <a className="brand" href="/">
            <span className="brand-dot" aria-hidden>🛒</span>
            <span className="name">Supermarket</span>
          </a>
          <NavLinks />
          <form className="logout row" action="/api/logout" method="post">
            {user && <span className="muted">{user}</span>}
            <button className="btn small" type="submit">Salir</button>
          </form>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
