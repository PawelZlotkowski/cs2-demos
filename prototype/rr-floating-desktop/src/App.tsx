import { useState } from 'react';
import Desktop from './desktop/Desktop';
import WindowManager from './desktop/WindowManager';
import { Match, Problem } from './mock/data';

export type WindowType = 'matches' | 'analysis' | 'problem' | 'coach' | 'drills';

export interface WindowState {
  id: WindowType;
  isOpen: boolean;
  isMinimized: boolean;
  zIndex: number;
  selectedMatch?: Match;
  selectedProblem?: Problem;
}

function App() {
  const [windows, setWindows] = useState<WindowState[]>([
    { id: 'matches', isOpen: false, isMinimized: false, zIndex: 1 },
    { id: 'analysis', isOpen: false, isMinimized: false, zIndex: 1 },
    { id: 'problem', isOpen: false, isMinimized: false, zIndex: 1 },
    { id: 'coach', isOpen: false, isMinimized: false, zIndex: 1 },
    { id: 'drills', isOpen: false, isMinimized: false, zIndex: 1 },
  ]);

  const [highestZ, setHighestZ] = useState(1);

  const openWindow = (id: WindowType, data?: { match?: Match; problem?: Problem }) => {
    setWindows(prev => {
      const existing = prev.find(w => w.id === id);
      if (existing?.isOpen && !existing.isMinimized) {
        return prev.map(w => 
          w.id === id 
            ? { ...w, zIndex: highestZ + 1, ...data } 
            : w
        );
      }
      setHighestZ(h => h + 1);
      return prev.map(w => 
        w.id === id 
          ? { ...w, isOpen: true, isMinimized: false, zIndex: highestZ + 1, ...data }
          : w
      );
    });
  };

  const closeWindow = (id: WindowType) => {
    setWindows(prev => prev.map(w => 
      w.id === id ? { ...w, isOpen: false } : w
    ));
  };

  const minimizeWindow = (id: WindowType) => {
    setWindows(prev => prev.map(w => 
      w.id === id ? { ...w, isMinimized: true } : w
    ));
  };

  const focusWindow = (id: WindowType) => {
    setHighestZ(h => h + 1);
    setWindows(prev => prev.map(w => 
      w.id === id ? { ...w, zIndex: highestZ + 1 } : w
    ));
  };

  return (
    <Desktop 
      windows={windows}
      openWindow={openWindow}
    >
      <WindowManager
        windows={windows}
        openWindow={openWindow}
        closeWindow={closeWindow}
        minimizeWindow={minimizeWindow}
        focusWindow={focusWindow}
      />
    </Desktop>
  );
}

export default App;
