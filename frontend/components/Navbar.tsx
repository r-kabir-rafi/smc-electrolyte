import Link from "next/link";
import styles from "./Navbar.module.css";

export default function Navbar() {
  return (
    <header className={styles.nav}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          Heatwave Monitor
        </Link>
        <nav className={styles.links}>
          <Link href="/" className={styles.link}>
            Home
          </Link>
          <Link href="/incidents" className={styles.link}>
            Incidents
          </Link>
        </nav>
      </div>
    </header>
  );
}
