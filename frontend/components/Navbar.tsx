import styles from "./Navbar.module.css";

export default function Navbar() {
  return (
    <header className={styles.nav}>
      <div className={styles.inner}>
        <a href="/" className={styles.brand}>
          Heatwave Monitor
        </a>
        <nav className={styles.links}>
          <a href="/" className={styles.link}>
            Home
          </a>
          <a href="/incidents" className={styles.link}>
            Incidents
          </a>
        </nav>
      </div>
    </header>
  );
}
