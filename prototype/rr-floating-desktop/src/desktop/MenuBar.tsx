import styles from './MenuBar.module.css';

export default function MenuBar() {
  return (
    <div className={styles['menu-bar']}>
      <span className={styles['menu-bar-app-name']}>Round Reviewer</span>
      <button className={styles['menu-bar-item']}>File</button>
      <button className={styles['menu-bar-item']}>Match</button>
      <button className={styles['menu-bar-item']}>View</button>
    </div>
  );
}
