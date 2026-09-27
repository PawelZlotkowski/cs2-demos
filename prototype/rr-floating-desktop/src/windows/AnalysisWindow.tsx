import { Match, Problem, mockProblems } from '../mock/data';
import styles from './AnalysisWindow.module.css';

interface AnalysisWindowProps {
  match?: Match;
  onSelectProblem: (problem: Problem) => void;
}

export default function AnalysisWindow({ match, onSelectProblem }: AnalysisWindowProps) {
  if (!match) {
    return (
      <div className={styles['analysis-window']}>
        <p style={{ color: 'var(--muted)', textAlign: 'center' }}>
          Select a match to view analysis
        </p>
      </div>
    );
  }

  const [scoreLeft, scoreRight] = match.score.split('-');
  const lastDigit = scoreRight[scoreRight.length - 1];
  const otherDigits = scoreRight.slice(0, -1);

  return (
    <div className={styles['analysis-window']}>
      <div className={styles['score-card']}>
        <div className={styles['score-label']}>SCORE</div>
        <div className={styles['score-value']}>
          {scoreLeft} - {otherDigits}<span className={styles['score-accent']}>{lastDigit}</span>
        </div>
        <div className={styles['score-subtitle']}>
          Round 1 vs. {match.opponent}
        </div>
      </div>

      <div className={styles['problems-section']}>
        <div className={styles['problems-header']}>
          <h2 className={styles['problems-title']}>Problems</h2>
          <span className={styles['problems-count']}>({mockProblems.length})</span>
        </div>

        <div className={styles['problems-list']}>
          {mockProblems.map(problem => (
            <button
              key={problem.id}
              className={styles['problem-row']}
              onClick={() => onSelectProblem(problem)}
            >
              <span className={styles['problem-round']}>R{problem.round}</span>
              <div className={styles['problem-content']}>
                <span className={styles['problem-title']}>{problem.title}</span>
              </div>
              <span className={`${styles['problem-severity']} ${styles[`severity-${problem.severity.toLowerCase()}`]}`}>
                {problem.severity}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
