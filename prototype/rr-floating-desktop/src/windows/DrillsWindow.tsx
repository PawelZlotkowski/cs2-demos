import { useState } from 'react';
import { mockDrills, Drill } from '../mock/data';
import styles from './DrillsWindow.module.css';

export default function DrillsWindow() {
  const [drills, setDrills] = useState<Drill[]>(mockDrills);

  const toggleDrill = (id: string) => {
    setDrills(prev => prev.map(drill => 
      drill.id === id ? { ...drill, completed: !drill.completed } : drill
    ));
  };

  return (
    <div className={styles['drills-window']}>
      <div className={styles['drills-header']}>
        <h2 className={styles['drills-title']}>Drills</h2>
      </div>

      <div className={styles['drills-list']}>
        {drills.map(drill => (
          <div key={drill.id} className={styles['drill-item']}>
            <button
              className={`${styles['drill-checkbox']} ${drill.completed ? styles.checked : ''}`}
              onClick={() => toggleDrill(drill.id)}
              aria-label={drill.completed ? 'Mark incomplete' : 'Mark complete'}
            >
              {drill.completed && (
                <svg viewBox="0 0 24 24" fill="none">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>

            <div className={styles['drill-content']}>
              <div className={styles['drill-title']}>{drill.title}</div>
              <div className={styles['drill-description']}>{drill.description}</div>
              <button className={styles['drill-link']}>Why this matters →</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
