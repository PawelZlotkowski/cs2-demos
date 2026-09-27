import { mockMatches, Match } from '../mock/data';
import styles from './MatchesWindow.module.css';

interface MatchesWindowProps {
  onSelectMatch: (match: Match) => void;
}

export default function MatchesWindow({ onSelectMatch }: MatchesWindowProps) {
  return (
    <div className={styles['matches-window']}>
      <button className={`button-ghost ${styles['import-button']}`}>
        Import Match...
      </button>
      
      <div className={styles['matches-header']}>
        <h2>Matches</h2>
        <span className={styles['matches-count']}>{mockMatches.length} Matches</span>
      </div>

      <div className={styles['matches-list']}>
        {mockMatches.map(match => (
          <button
            key={match.id}
            className={styles['match-row']}
            onClick={() => onSelectMatch(match)}
          >
            <div className={styles['match-top']}>
              <span className={styles['match-title']}>
                {match.map} vs. {match.opponent}
              </span>
              <span className={styles['match-score']}>{match.score}</span>
            </div>
            <div className={styles['match-bottom']}>
              <span className={styles['match-date']}>{match.date}</span>
              <span className={`${styles['match-result']} ${styles[match.result]}`}>
                {match.result}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
