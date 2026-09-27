import { WindowType, WindowState } from '../App';
import WindowFrame from './WindowFrame';
import MatchesWindow from '../windows/MatchesWindow';
import AnalysisWindow from '../windows/AnalysisWindow';
import ProblemWindow from '../windows/ProblemWindow';
import CoachWindow from '../windows/CoachWindow';
import DrillsWindow from '../windows/DrillsWindow';
import { Match, Problem, mockProblems } from '../mock/data';

interface WindowManagerProps {
  windows: WindowState[];
  openWindow: (id: WindowType, data?: { match?: Match; problem?: Problem }) => void;
  closeWindow: (id: WindowType) => void;
  minimizeWindow: (id: WindowType) => void;
  focusWindow: (id: WindowType) => void;
}

const windowConfig: Record<WindowType, { title: string; width: number; height: number }> = {
  matches: { title: 'Matches', width: 520, height: 640 },
  analysis: { title: 'Analysis', width: 700, height: 780 },
  problem: { title: 'Problem', width: 960, height: 720 },
  coach: { title: 'Coach', width: 420, height: 640 },
  drills: { title: 'Drills', width: 480, height: 560 },
};

export default function WindowManager({
  windows,
  openWindow,
  closeWindow,
  minimizeWindow,
  focusWindow,
}: WindowManagerProps) {
  const highestZ = Math.max(...windows.map(w => w.zIndex));

  const handleSelectMatch = (match: Match) => {
    openWindow('analysis', { match });
  };

  const handleSelectProblem = (problem: Problem) => {
    openWindow('problem', { problem });
  };

  const handleViewProblemFromCoach = (problemId: string) => {
    const problem = mockProblems.find(p => p.id === problemId);
    if (problem) {
      openWindow('problem', { problem });
    }
  };

  return (
    <>
      {windows.map(window => {
        if (!window.isOpen || window.isMinimized) return null;

        const config = windowConfig[window.id];
        const isFocused = window.zIndex === highestZ;

        return (
          <WindowFrame
            key={window.id}
            id={window.id}
            title={config.title}
            width={config.width}
            height={config.height}
            zIndex={window.zIndex}
            isFocused={isFocused}
            onClose={() => closeWindow(window.id)}
            onMinimize={() => minimizeWindow(window.id)}
            onFocus={() => focusWindow(window.id)}
          >
            {window.id === 'matches' && (
              <MatchesWindow onSelectMatch={handleSelectMatch} />
            )}
            {window.id === 'analysis' && (
              <AnalysisWindow
                match={window.selectedMatch}
                onSelectProblem={handleSelectProblem}
              />
            )}
            {window.id === 'problem' && (
              <ProblemWindow problem={window.selectedProblem} />
            )}
            {window.id === 'coach' && (
              <CoachWindow onViewProblem={handleViewProblemFromCoach} />
            )}
            {window.id === 'drills' && <DrillsWindow />}
          </WindowFrame>
        );
      })}
    </>
  );
}
