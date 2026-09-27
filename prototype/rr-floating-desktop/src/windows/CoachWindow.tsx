import { mockCoachMessages } from '../mock/data';
import styles from './CoachWindow.module.css';

interface CoachWindowProps {
  onViewProblem?: (problemId: string) => void;
}

export default function CoachWindow({ onViewProblem }: CoachWindowProps) {
  return (
    <div className={styles['coach-window']}>
      <div className={styles['coach-header']}>
        <h2 className={styles['coach-title']}>Coach</h2>
      </div>

      <div className={styles['messages-list']}>
        {mockCoachMessages.map(message => (
          <div key={message.id} className={styles.message}>
            {message.problemLink ? (
              <div className={styles['message-with-link']}>
                <p>{message.text}</p>
                <button 
                  className={`button-ghost ${styles['message-link']}`}
                  onClick={() => onViewProblem?.(message.problemLink!)}
                >
                  View Evidence
                </button>
              </div>
            ) : (
              <p>{message.text}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
