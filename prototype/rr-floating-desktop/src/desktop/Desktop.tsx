import { useEffect } from 'react';
import { useStore } from '../state/store';
import { AddMatchWindow } from '../windows/AddMatchWindow';
import { CoachWindow } from '../windows/CoachWindow';
import { LabWindow } from '../windows/LabWindow';
import { MatchesWindow } from '../windows/MatchesWindow';
import { ProgressWindow } from '../windows/ProgressWindow';
import { SettingsWindow } from '../windows/SettingsWindow';
import { StudioWindow } from '../windows/StudioWindow';
import { Dock } from './Dock';
import { MenuBar } from './MenuBar';
import { Notices } from './Notices';
import { WindowBoundary } from './WindowBoundary';

export function Desktop() {
  const { wins, open, lab } = useStore();

  useEffect(() => {
    open('matches');
  }, [open]);

  return (
    <div className="desktop">
      <MenuBar />
      {wins.matches.open ? (
        <WindowBoundary id="matches">
          <MatchesWindow />
        </WindowBoundary>
      ) : null}
      {wins.addMatch.open ? (
        <WindowBoundary id="addMatch">
          <AddMatchWindow />
        </WindowBoundary>
      ) : null}
      {wins.studio.open ? (
        <WindowBoundary id="studio">
          <StudioWindow />
        </WindowBoundary>
      ) : null}
      {wins.progress.open ? (
        <WindowBoundary id="progress">
          <ProgressWindow />
        </WindowBoundary>
      ) : null}
      {wins.coach.open ? (
        <WindowBoundary id="coach">
          <CoachWindow />
        </WindowBoundary>
      ) : null}
      {wins.settings.open ? (
        <WindowBoundary id="settings">
          <SettingsWindow />
        </WindowBoundary>
      ) : null}
      {lab && wins.lab.open ? (
        <WindowBoundary id="lab">
          <LabWindow />
        </WindowBoundary>
      ) : null}
      <Notices />
      <Dock />
    </div>
  );
}
